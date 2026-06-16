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
