'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const eventBus = require('../../shared/events/eventBus');

// ── Enroll (free or paid — paid courses require admin payment confirmation) ──
async function enroll({ userId, courseId }) {
  const { rows: courseRows } = await db.query(
    `SELECT id, is_free, status FROM courses WHERE id = $1 AND deleted_at IS NULL`,
    [courseId]
  );
  const course = courseRows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (course.status !== 'published') throw ApiError.badRequest('Course not available for enrollment');

  const { rows: existingRows } = await db.query(
    `SELECT id, status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (existingRows[0]?.status === 'active') {
    throw ApiError.conflict('You are already enrolled in this course');
  }

  if (course.is_free) {
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
    eventBus.emit('enrollment.created', { userId, courseId });
    return { type: 'free_enrollment', enrollment: result };
  }

  // Paid course — student must contact admin for manual payment
  return { type: 'payment_required', message: 'This is a paid course. Please contact admin to complete payment.' };
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
  enroll, myEnrollments,
  listEnrollments, manualEnroll, courseEnrollments, revokeEnrollment,
};


// ─────────────────────────────────────────────
//  MANUAL PAYMENT RECORDS
// ─────────────────────────────────────────────

async function recordPayment(adminId, { userId, courseId, amount, currency, paymentMethod, reference, notes }) {
  const [userCheck, courseCheck] = await Promise.all([
    db.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]),
    db.query('SELECT id, title, price FROM courses WHERE id = $1 AND deleted_at IS NULL', [courseId]),
  ]);
  if (!userCheck.rows[0])   throw ApiError.notFound('User not found');
  if (!courseCheck.rows[0]) throw ApiError.notFound('Course not found');

  const { rows } = await db.query(
    `INSERT INTO manual_payments
       (user_id, course_id, amount, currency, payment_method,
        reference, notes, status, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
     RETURNING *`,
    [userId, courseId, amount, currency || 'NGN',
     paymentMethod || 'cash', reference || null, notes || null, adminId]
  );
  return rows[0];
}

async function confirmPayment(paymentId, adminId) {
  const { rows: pRows } = await db.query(
    `SELECT * FROM manual_payments WHERE id = $1`,
    [paymentId]
  );
  const payment = pRows[0];
  if (!payment) throw ApiError.notFound('Payment record not found');
  if (payment.status === 'confirmed') throw ApiError.conflict('Payment already confirmed');

  const enrollment = await db.transaction(async (client) => {
    // Confirm payment
    await client.query(
      `UPDATE manual_payments SET
         status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [adminId, paymentId]
    );

    // Create enrollment
    const { rows: enrRows } = await client.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active', enrolled_at = NOW()
       RETURNING *`,
      [payment.user_id, payment.course_id]
    );

    // Link enrollment back to payment
    await client.query(
      'UPDATE manual_payments SET enrollment_id = $1 WHERE id = $2',
      [enrRows[0].id, paymentId]
    );

    await client.query(
      'UPDATE courses SET student_count = student_count + 1 WHERE id = $1',
      [payment.course_id]
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'payment.confirmed', 'manual_payment', $2, $3)`,
      [adminId, paymentId, JSON.stringify({ userId: payment.user_id, courseId: payment.course_id })]
    );

    return enrRows[0];
  });

  eventBus.emit('enrollment.created', { userId: payment.user_id, courseId: payment.course_id });
  return { payment: { ...payment, status: 'confirmed' }, enrollment };
}

async function rejectPayment(paymentId, adminId, reason) {
  const { rows } = await db.query(
    `UPDATE manual_payments SET
       status = 'rejected', confirmed_by = $1,
       rejected_reason = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [adminId, reason || null, paymentId]
  );
  if (!rows[0]) throw ApiError.notFound('Payment not found or already processed');
  return rows[0];
}

async function listPayments({ page = 1, limit = 20, status, courseId, userId: filterUserId }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (status)       { conditions.push(`mp.status = $${i++}`);    params.push(status); }
  if (courseId)     { conditions.push(`mp.course_id = $${i++}`); params.push(courseId); }
  if (filterUserId) { conditions.push(`mp.user_id = $${i++}`);   params.push(filterUserId); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [countRes, rowsRes] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM manual_payments mp ${where}`, params),
    db.query(
      `SELECT
         mp.id, mp.amount, mp.currency, mp.payment_method, mp.reference,
         mp.status, mp.notes, mp.created_at, mp.confirmed_at,
         u.email, u.first_name, u.last_name,
         c.title AS course_title
       FROM manual_payments mp
       JOIN users u ON u.id = mp.user_id
       JOIN courses c ON c.id = mp.course_id
       ${where}
       ORDER BY mp.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    payments: rowsRes.rows,
    total:    parseInt(countRes.rows[0].count, 10),
    page:     parseInt(page, 10),
    limit:    parseInt(limit, 10),
  };
}

// Append new exports
module.exports = Object.assign(module.exports, {
  recordPayment, confirmPayment, rejectPayment, listPayments,
});


// ─────────────────────────────────────────────
//  EXTERNAL PAYMENT GATEWAY INTEGRATION
//
//  Flow:
//   1. Separate payment site calls our webhook with proof of payment.
//   2. We log the raw event, verify the signature, and create a
//      'pending' manual_payments row (origin = external_gateway).
//      No user account exists yet — we only have buyer details.
//   3. Admin reviews it in the panel and clicks Approve.
//   4. On approve:
//        - find existing user by email, OR create a new one
//          with a generated temp password (must_change_password = true)
//        - enroll them in the course
//        - email login credentials (new account) or a simple
//          confirmation (existing account)
// ─────────────────────────────────────────────

const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const env       = require('../../config/env');
const { sendMail } = require('../../shared/mailer/mailer');
const {
  welcomeCredentialsEmail,
  enrollmentConfirmedEmail,
  paymentRejectedEmail,
} = require('../../shared/mailer/templates');
const { generateTempPassword } = require('../../shared/utils/generatePasswords');

/**
 * Verify the webhook signature using HMAC-SHA256.
 * The payment site must sign the raw JSON body with the
 * shared PAYMENT_WEBHOOK_SECRET and send it as `X-Webhook-Signature`.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch etc.
  }
}

/**
 * Receive a webhook event from the external payment system.
 *
 * Expected payload shape:
 * {
 *   externalReference: "PAY-2026-00041",
 *   courseId:    "uuid",
 *   amount:      15000,
 *   currency:    "NGN",
 *   paymentMethod: "card_gateway",
 *   buyer: { email, firstName, lastName, phone }
 * }
 */
async function receiveWebhook(rawBody, signatureHeader) {
  const signatureValid = verifyWebhookSignature(rawBody, signatureHeader);

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Invalid JSON payload');
  }

  // Always log the event first, signature outcome included,
  // even if we're about to reject it. This is our audit trail.
  const { rows: logRows } = await db.query(
    `INSERT INTO payment_webhook_events
       (external_reference, payload, signature_valid)
     VALUES ($1,$2,$3) RETURNING id`,
    [payload.externalReference || null, JSON.stringify(payload), signatureValid]
  );
  const webhookEventId = logRows[0].id;

  if (!signatureValid) {
    await db.query(
      `UPDATE payment_webhook_events SET processing_error = $1 WHERE id = $2`,
      ['Invalid signature', webhookEventId]
    );
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  const { externalReference, courseId, amount, currency, paymentMethod, buyer } = payload;

  if (!externalReference || !courseId || !amount || !buyer?.email) {
    await db.query(
      `UPDATE payment_webhook_events SET processing_error = $1 WHERE id = $2`,
      ['Missing required fields', webhookEventId]
    );
    throw ApiError.badRequest('Missing required fields: externalReference, courseId, amount, buyer.email');
  }

  // Idempotency — if we've already recorded this exact transaction, return it as-is
  const { rows: existingRows } = await db.query(
    'SELECT * FROM manual_payments WHERE external_reference = $1',
    [externalReference]
  );
  if (existingRows[0]) {
    await db.query(
      `UPDATE payment_webhook_events SET processed = true, manual_payment_id = $1 WHERE id = $2`,
      [existingRows[0].id, webhookEventId]
    );
    return { duplicate: true, payment: existingRows[0] };
  }

  // Verify the course exists
  const { rows: courseRows } = await db.query(
    'SELECT id, title FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!courseRows[0]) {
    await db.query(
      `UPDATE payment_webhook_events SET processing_error = $1 WHERE id = $2`,
      ['Course not found', webhookEventId]
    );
    throw ApiError.notFound('Course not found');
  }

  // Check if a user already exists with this email
  const { rows: userRows } = await db.query(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [buyer.email.toLowerCase()]
  );

  const { rows: paymentRows } = await db.query(
    `INSERT INTO manual_payments
       (user_id, course_id, amount, currency, payment_method,
        external_reference, external_payload, origin, status,
        buyer_email, buyer_first_name, buyer_last_name, buyer_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'external_gateway','pending',$8,$9,$10,$11)
     RETURNING *`,
    [
      userRows[0]?.id || null, courseId, amount, currency || 'NGN',
      paymentMethod || 'card_gateway',
      externalReference, JSON.stringify(payload),
      buyer.email.toLowerCase(), buyer.firstName || null,
      buyer.lastName || null, buyer.phone || null,
    ]
  );

  await db.query(
    `UPDATE payment_webhook_events SET processed = true, manual_payment_id = $1 WHERE id = $2`,
    [paymentRows[0].id, webhookEventId]
  );

  console.log(`[Webhook] Payment received: ${externalReference} for course "${courseRows[0].title}"`);

  return { duplicate: false, payment: paymentRows[0] };
}

/**
 * Admin approves a webhook-originated payment.
 * Creates the account (if needed), enrolls the student,
 * and emails their login credentials.
 */
async function approveGatewayPayment(paymentId, adminId) {
  const { rows: pRows } = await db.query(
    `SELECT mp.*, c.title AS course_title
     FROM manual_payments mp
     JOIN courses c ON c.id = mp.course_id
     WHERE mp.id = $1`,
    [paymentId]
  );
  const payment = pRows[0];
  if (!payment) throw ApiError.notFound('Payment record not found');
  if (payment.origin !== 'external_gateway') {
    throw ApiError.badRequest('This is not a gateway payment — use the standard confirm endpoint');
  }
  if (payment.status === 'confirmed') throw ApiError.conflict('Payment already confirmed');

  let isNewAccount = false;
  let tempPassword = null;
  let userId       = payment.user_id;

  const result = await db.transaction(async (client) => {
    // ── Find or create the user ──────────────
    if (!userId) {
      const { rows: existing } = await client.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [payment.buyer_email]
      );

      if (existing[0]) {
        userId = existing[0].id;
      } else {
        isNewAccount = true;
        tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, env.BCRYPT_SALT_ROUNDS);

        const { rows: newUser } = await client.query(
          `INSERT INTO users
             (email, password_hash, first_name, last_name, role, status,
              email_verified_at, must_change_password)
           VALUES ($1,$2,$3,$4,'student','active',NOW(),true)
           RETURNING id`,
          [
            payment.buyer_email,
            passwordHash,
            payment.buyer_first_name || 'Student',
            payment.buyer_last_name  || '',
          ]
        );
        userId = newUser[0].id;

        await client.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
           VALUES ($1, 'user.auto_provisioned', 'user', $2, $3)`,
          [adminId, userId, JSON.stringify({ email: payment.buyer_email, paymentId })]
        );
      }
    }

    // ── Enroll the student ───────────────────
    const { rows: enrRows } = await client.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active', enrolled_at = NOW()
       RETURNING *`,
      [userId, payment.course_id]
    );

    await client.query(
      'UPDATE courses SET student_count = student_count + 1 WHERE id = $1',
      [payment.course_id]
    );

    // ── Mark payment confirmed ───────────────
    await client.query(
      `UPDATE manual_payments SET
         status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(),
         user_id = $2, enrollment_id = $3,
         account_created = $4, updated_at = NOW()
       WHERE id = $5`,
      [adminId, userId, enrRows[0].id, isNewAccount, paymentId]
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'payment.gateway_approved', 'manual_payment', $2, $3)`,
      [adminId, paymentId, JSON.stringify({ userId, courseId: payment.course_id, isNewAccount })]
    );

    return enrRows[0];
  });

  // ── Send the appropriate email (outside the transaction) ──
  try {
    if (isNewAccount) {
      await sendMail({
        to:      payment.buyer_email,
        subject: `Your login details for ${payment.course_title}`,
        html:    welcomeCredentialsEmail({
          firstName:    payment.buyer_first_name || 'Student',
          email:        payment.buyer_email,
          tempPassword,
          courseTitle:  payment.course_title,
        }),
      });
    } else {
      await sendMail({
        to:      payment.buyer_email,
        subject: `Enrolled: ${payment.course_title}`,
        html:    enrollmentConfirmedEmail({
          firstName:   payment.buyer_first_name || 'Student',
          courseTitle: payment.course_title,
        }),
      });
    }
    await db.query(
      `UPDATE manual_payments SET credentials_email_sent = true, credentials_sent_at = NOW() WHERE id = $1`,
      [paymentId]
    );
  } catch (err) {
    // Don't fail the whole approval if email delivery fails —
    // admin can see credentials_email_sent = false and resend manually.
    console.error('[Enrollments] Failed to send credentials email:', err.message);
  }

  eventBus.emit('enrollment.created', { userId, courseId: payment.course_id });

  return { enrollment: result, isNewAccount, userId };
}

/** Admin rejects a webhook-originated payment. */
async function rejectGatewayPayment(paymentId, adminId, reason) {
  const { rows } = await db.query(
    `SELECT mp.*, c.title AS course_title
     FROM manual_payments mp JOIN courses c ON c.id = mp.course_id
     WHERE mp.id = $1 AND mp.status = 'pending'`,
    [paymentId]
  );
  if (!rows[0]) throw ApiError.notFound('Pending payment not found');
  const payment = rows[0];

  await db.query(
    `UPDATE manual_payments SET
       status = 'rejected', confirmed_by = $1,
       rejected_reason = $2, updated_at = NOW()
     WHERE id = $3`,
    [adminId, reason || null, paymentId]
  );

  try {
    await sendMail({
      to:      payment.buyer_email,
      subject: `Payment verification issue — ${payment.course_title}`,
      html:    paymentRejectedEmail({
        firstName:   payment.buyer_first_name,
        courseTitle: payment.course_title,
        reason,
      }),
    });
  } catch (err) {
    console.error('[Enrollments] Failed to send rejection email:', err.message);
  }

  return payment;
}

/** List pending gateway payments awaiting admin review. */
async function listGatewayPayments({ page = 1, limit = 20, status = 'pending' }) {
  const offset = (page - 1) * limit;

  const [countRes, rowsRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM manual_payments WHERE origin = 'external_gateway' AND status = $1`,
      [status]
    ),
    db.query(
      `SELECT mp.id, mp.amount, mp.currency, mp.payment_method, mp.external_reference,
              mp.buyer_email, mp.buyer_first_name, mp.buyer_last_name, mp.buyer_phone,
              mp.status, mp.account_created, mp.credentials_email_sent,
              mp.created_at, mp.confirmed_at,
              c.title AS course_title, c.id AS course_id
       FROM manual_payments mp
       JOIN courses c ON c.id = mp.course_id
       WHERE mp.origin = 'external_gateway' AND mp.status = $1
       ORDER BY mp.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
  ]);

  return {
    payments: rowsRes.rows,
    total:    parseInt(countRes.rows[0].count, 10),
    page:     parseInt(page, 10),
    limit:    parseInt(limit, 10),
  };
}

module.exports = Object.assign(module.exports, {
  receiveWebhook, approveGatewayPayment, rejectGatewayPayment, listGatewayPayments,
});
