'use strict';

const db       = require('../../config/db');
const env      = require('../../config/env');
const ApiError = require('../../shared/utils/apiError');
const eventBus = require('../../shared/events/eventBus');

// Stripe initialised lazily — only errors if STRIPE_SECRET_KEY missing when used
let stripe;
function getStripe() {
  if (!stripe) {
    if (!env.STRIPE_SECRET_KEY) throw ApiError.internal('Stripe is not configured');
    stripe = require('stripe')(env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// ── Enroll (free course or initiate Stripe checkout) ──
async function enroll({ userId, courseId, couponCode }) {
  // 1. Load course
  const { rows: courseRows } = await db.query(
    `SELECT id, title, is_free, price, discount_price, currency, status, slug
     FROM courses WHERE id = $1 AND deleted_at IS NULL`,
    [courseId]
  );
  const course = courseRows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (course.status !== 'published') throw ApiError.badRequest('This course is not available for enrollment');

  // 2. Check existing enrollment
  const { rows: existingRows } = await db.query(
    `SELECT id, status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (existingRows[0]?.status === 'active') {
    throw ApiError.conflict('You are already enrolled in this course');
  }

  // 3. Free course — enroll directly
  if (course.is_free) {
    return await createFreeEnrollment(userId, courseId);
  }

  // 4. Paid course — apply coupon if provided
  let finalAmount   = parseFloat(course.discount_price || course.price);
  let discountAmount = 0;
  let couponId      = null;

  if (couponCode) {
    const couponResult = await applyCoupon(couponCode, finalAmount);
    finalAmount    = couponResult.finalAmount;
    discountAmount = couponResult.discountAmount;
    couponId       = couponResult.couponId;
  }

  // 5. Create pending order
  const { rows: orderRows } = await db.query(
    `INSERT INTO orders
       (user_id, course_id, coupon_id, original_price, discount_amount, final_amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
     RETURNING *`,
    [userId, courseId, couponId,
     course.price, discountAmount, finalAmount, course.currency]
  );
  const order = orderRows[0];

  // 6. Create Stripe Checkout Session
  const s = getStripe();
  const session = await s.checkout.sessions.create({
    payment_method_types: ['card'],
    mode:                 'payment',
    line_items: [{
      price_data: {
        currency:     course.currency.toLowerCase(),
        unit_amount:  Math.round(finalAmount * 100), // Stripe uses cents
        product_data: {
          name:        course.title,
          description: `Enrollment — ${course.title}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      orderId:  order.id,
      userId,
      courseId,
    },
    success_url: `${env.APP_URL}/courses/${course.slug}?enrolled=success`,
    cancel_url:  `${env.APP_URL}/courses/${course.slug}?payment=cancelled`,
  });

  // 7. Store Stripe session ID on the order
  await db.query(
    'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
    [session.id, order.id]
  );

  return {
    type:       'payment_required',
    checkoutUrl: session.url,
    sessionId:   session.id,
    orderId:     order.id,
    amount:      finalAmount,
    currency:    course.currency,
  };
}

// ── Handle Stripe webhook ─────────────────────
async function handleStripeWebhook(rawBody, signature) {
  const s = getStripe();
  let event;

  try {
    event = s.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const { orderId, userId, courseId } = session.metadata;

    await db.transaction(async (client) => {
      // Update order to completed
      await client.query(
        `UPDATE orders
         SET status = 'completed',
             stripe_payment_intent_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [session.payment_intent, orderId]
      );

      // Create or activate enrollment
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, order_id, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (user_id, course_id)
         DO UPDATE SET status = 'active', order_id = $3, enrolled_at = NOW()`,
        [userId, courseId, orderId]
      );

      // Update course student count
      await client.query(
        `UPDATE courses SET student_count = student_count + 1 WHERE id = $1`,
        [courseId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
         VALUES ($1, 'enrollment.created', 'enrollment', $2, $3)`,
        [userId, courseId, JSON.stringify({ orderId, amount: session.amount_total / 100 })]
      );
    });

    eventBus.emit('enrollment.created', { userId, courseId, orderId });
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    await db.query(
      `UPDATE orders SET status = 'refunded', refunded_at = NOW() WHERE stripe_charge_id = $1`,
      [charge.id]
    );
    // Enrollment stays active unless admin manually revokes
    eventBus.emit('order.refunded', { chargeId: charge.id });
  }

  return { received: true };
}

// ── Create free enrollment directly ──────────
async function createFreeEnrollment(userId, courseId) {
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id)
       DO UPDATE SET status = 'active', enrolled_at = NOW()
       RETURNING *`,
      [userId, courseId]
    );
    await client.query(
      'UPDATE courses SET student_count = student_count + 1 WHERE id = $1',
      [courseId]
    );
    return rows[0];
  });

  eventBus.emit('enrollment.created', { userId, courseId, orderId: null });
  return { type: 'free_enrollment', enrollment: result };
}

// ── Apply coupon ──────────────────────────────
async function applyCoupon(code, originalAmount) {
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE code = UPPER($1) AND is_active = true
       AND valid_from <= NOW()
       AND (valid_until IS NULL OR valid_until >= NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)`,
    [code]
  );
  if (!rows[0]) throw ApiError.badRequest('Invalid or expired coupon code');
  const coupon = rows[0];

  let discountAmount = 0;
  if (coupon.discount_type === 'percent') {
    discountAmount = (originalAmount * parseFloat(coupon.discount_value)) / 100;
  } else {
    discountAmount = Math.min(parseFloat(coupon.discount_value), originalAmount);
  }

  const finalAmount = Math.max(0, originalAmount - discountAmount);

  // Increment usage count
  await db.query('UPDATE coupons SET uses_count = uses_count + 1 WHERE id = $1', [coupon.id]);

  return {
    couponId:      coupon.id,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalAmount:   parseFloat(finalAmount.toFixed(2)),
  };
}

// ── Get my enrollments ────────────────────────
async function myEnrollments(userId) {
  const { rows } = await db.query(
    `SELECT e.id, e.status, e.progress_percent, e.lessons_completed,
            e.enrolled_at, e.completed_at,
            c.id AS course_id, c.title, c.slug, c.level, c.duration_seconds,
            c.lesson_count, c.rating_average,
            u.first_name || ' ' || u.last_name AS instructor_name,
            f.storage_path AS thumbnail_path
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     JOIN users u ON u.id = c.instructor_id
     LEFT JOIN files f ON f.id = c.thumbnail_file_id
     WHERE e.user_id = $1 AND e.status != 'refunded'
     ORDER BY e.enrolled_at DESC`,
    [userId]
  );
  return rows;
}

// ── Admin: all enrollments (paginated) ────────
async function listEnrollments({ page = 1, limit = 20, courseId, userId: filterUserId }) {
  const offset     = (page - 1) * limit;
  const conditions = [];
  const params     = [];
  let   i          = 1;

  if (courseId) { conditions.push(`e.course_id = $${i++}`); params.push(courseId); }
  if (filterUserId) { conditions.push(`e.user_id = $${i++}`); params.push(filterUserId); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [countRes, rowsRes] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM enrollments e ${where}`, params),
    db.query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              u.id AS user_id, u.email, u.first_name, u.last_name,
              c.id AS course_id, c.title AS course_title
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN courses c ON c.id = e.course_id
       ${where}
       ORDER BY e.enrolled_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    enrollments: rowsRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

// ── Admin: manual enrollment ──────────────────
async function manualEnroll(adminId, { userId, courseId }) {
  const { rows: courseRows } = await db.query(
    'SELECT id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!courseRows[0]) throw ApiError.notFound('Course not found');

  const { rows } = await db.query(
    `INSERT INTO enrollments (user_id, course_id, status)
     VALUES ($1,$2,'active')
     ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active'
     RETURNING *`,
    [userId, courseId]
  );
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'enrollment.manual', 'enrollment', $2)`,
    [adminId, rows[0].id]
  );
  eventBus.emit('enrollment.created', { userId, courseId, orderId: null });
  return rows[0];
}

// ── Course enrollments (instructor/admin) ──────
async function courseEnrollments(courseId, requestingUser) {
  // Verify instructor owns the course (or is admin)
  if (requestingUser.role !== 'admin') {
    const { rows } = await db.query(
      'SELECT id FROM courses WHERE id = $1 AND instructor_id = $2',
      [courseId, requestingUser.id]
    );
    if (!rows[0]) throw ApiError.forbidden('You do not have access to this course\'s enrollments');
  }

  const { rows } = await db.query(
    `SELECT e.id, e.status, e.progress_percent, e.lessons_completed, e.enrolled_at, e.completed_at,
            u.id AS user_id, u.email, u.first_name, u.last_name
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     WHERE e.course_id = $1
     ORDER BY e.enrolled_at DESC`,
    [courseId]
  );
  return rows;
}

// ── Admin: revoke enrollment ──────────────────
async function revokeEnrollment(enrollmentId, adminId) {
  const { rows } = await db.query(
    `UPDATE enrollments SET status = 'expired'
     WHERE id = $1 RETURNING id, user_id, course_id`,
    [enrollmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Enrollment not found');
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'enrollment.revoked', 'enrollment', $2)`,
    [adminId, enrollmentId]
  );
  return rows[0];
}

module.exports = {
  enroll, handleStripeWebhook, myEnrollments,
  listEnrollments, manualEnroll, courseEnrollments, revokeEnrollment,
};
