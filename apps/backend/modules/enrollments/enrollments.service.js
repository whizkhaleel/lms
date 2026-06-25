'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const eventBus = require('../../shared/events/eventBus');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const env      = require('../../config/env');
const { sendMail } = require('../../shared/mailer/mailer');
const { welcomeCredentialsEmail, enrollmentConfirmedEmail } = require('../../shared/mailer/templates');
const { generateTempPassword } = require('../../shared/utils/generatePasswords');
const adminService = require('../admin/admin.service');

// ── Enroll (all courses directly enrollable) ──
async function enroll({ userId, courseId }) {
  const { rows: courseRows } = await db.query(
    `SELECT id, status FROM courses WHERE id = $1 AND deleted_at IS NULL`,
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
  await adminService.invalidateAnalyticsCache();
  return { type: 'enrollment', enrollment: result };
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
     WHERE e.user_id = $1 AND e.status != 'revoked'
     ORDER BY e.enrolled_at DESC`,
    [userId]
  );
  return rows;
}

// ── Get enrollment by id ──────────────────────
async function getEnrollment(enrollmentId) {
  const { rows } = await db.query(
    `SELECT e.*, c.title AS course_title, c.slug AS course_slug
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = $1`,
    [enrollmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Enrollment not found');
  return rows[0];
}

// ── Admin: list all enrollments ────────────────
async function listEnrollments({ page = 1, limit = 20, courseId, search, status } = {}) {
  const conditions = ['1=1'];
  const params = [];
  let i = 1;

  if (courseId) {
    conditions.push(`e.course_id = $${i++}`);
    params.push(courseId);
  }
  if (status) {
    conditions.push(`e.status = $${i++}`);
    params.push(status);
  }
  if (search) {
    conditions.push(`(u.first_name ILIKE $${i} OR u.last_name ILIKE $${i} OR u.email ILIKE $${i} OR c.title ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [countRes, enrollmentsRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN courses c ON c.id = e.course_id WHERE ${where}`,
      params
    ),
    db.query(
      `SELECT e.id, e.user_id, e.course_id, e.status, e.progress_percent,
              e.enrolled_at, e.completed_at,
              u.first_name || ' ' || u.last_name AS student_name, u.email AS student_email,
              c.title AS course_title, c.slug AS course_slug
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN courses c ON c.id = e.course_id
       WHERE ${where}
       ORDER BY e.enrolled_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    enrollments: enrollmentsRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

// ── Admin: list course enrollments ─────────────
async function courseEnrollments(courseId) {
  const { rows } = await db.query(
    `SELECT e.id, e.user_id, e.status, e.progress_percent, e.enrolled_at,
            u.first_name || ' ' || u.last_name AS student_name, u.email AS student_email
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     WHERE e.course_id = $1 AND e.status != 'revoked'
     ORDER BY e.enrolled_at DESC`,
    [courseId]
  );
  return rows;
}

// ── Admin: manual enrollment ───────────────────
async function manualEnroll(adminId, { userId, courseId }) {
  const course = await db.query(
    'SELECT id, status FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!course.rows[0]) throw ApiError.notFound('Course not found');

  const existing = await db.query(
    `SELECT id, status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (existing.rows[0]?.status === 'active') {
    throw ApiError.conflict('User is already enrolled in this course');
  }

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
  await adminService.invalidateAnalyticsCache();
  return result;
}

// ── Revoke enrollment ─────────────────────────
async function revokeEnrollment(enrollmentId, adminId) {
  const { rows } = await db.query(
    `UPDATE enrollments SET status = 'revoked' WHERE id = $1 AND status = 'active'
     RETURNING user_id, course_id`,
    [enrollmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Active enrollment not found');

  await db.query(
    'UPDATE courses SET student_count = GREATEST(student_count - 1, 0) WHERE id = $1',
    [rows[0].course_id]
  );

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'enrollment.revoked', 'enrollment', $2)`,
    [adminId, enrollmentId]
  );

  eventBus.emit('enrollment.revoked', { userId: rows[0].user_id, courseId: rows[0].course_id });
  await adminService.invalidateAnalyticsCache();
}

// ── External payment webhook ───────────────────
function verifyWebhookSignature(payload, signature) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function receiveWebhook(req) {
  const signature = req.headers['x-webhook-signature'];
  const rawBody   = req.body;

  if (!verifyWebhookSignature(rawBody.toString(), signature)) {
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw ApiError.badRequest('Invalid JSON payload');
  }

  const { externalReference, courseId, buyer } = body;
  if (!externalReference || !courseId || !buyer?.email) {
    throw ApiError.badRequest('Missing required fields: externalReference, courseId, buyer.email');
  }

  // Check for duplicate
  const existing = await db.query(
    `SELECT id FROM manual_payments WHERE external_reference = $1`,
    [externalReference]
  );
  if (existing.rows.length > 0) {
    return { type: 'duplicate', message: 'Already processed' };
  }

  // Log the webhook event
  await db.query(
    `INSERT INTO payment_webhook_events (external_reference, payload, signature_valid)
     VALUES ($1, $2, true)`,
    [externalReference, JSON.stringify(body)]
  );

  // Find or create user
  const { rows: userRows } = await db.query(
    'SELECT id, email FROM users WHERE email = $1',
    [buyer.email]
  );

  let userId;
  let isNewUser = false;
  let tempPassword;

  if (userRows.length > 0) {
    userId = userRows[0].id;
  } else {
    isNewUser = true;
    tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { rows: newUser } = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status, email_verified_at)
       VALUES ($1, $2, $3, $4, 'student', 'active', NOW())
       RETURNING id`,
      [buyer.firstName || 'Student', buyer.lastName || '', buyer.email, passwordHash]
    );
    userId = newUser[0].id;
  }

  // Look up instructor for recorded_by
  const { rows: courseRow } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1', [courseId]
  );
  const recordedBy = courseRow[0]?.instructor_id || userId;

  // Record pending payment (admin must approve)
  await db.query(
    `INSERT INTO manual_payments (user_id, course_id, reference, origin, buyer_email,
       buyer_first_name, buyer_last_name, external_reference, status, recorded_by,
       account_created, credentials_email_sent)
     VALUES ($1, $2, $3, 'external_gateway', $4, $5, $6, $7, 'pending', $8, $9, false)`,
    [
      userId, courseId, `webhook-${externalReference}`,
      buyer.email, buyer.firstName || 'Student', buyer.lastName || '',
      externalReference, recordedBy, isNewUser,
    ]
  );

  await adminService.invalidateAnalyticsCache();

  return {
    type: 'pending_review',
    message: 'Enrollment pending admin approval',
  };
}

// ── Admin: list pending external enrollments ────
async function listPendingEnrollments({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const [countRes, rowsRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM manual_payments
       WHERE status = 'pending' AND origin = 'external_gateway'`
    ),
    db.query(
      `SELECT mp.id, mp.user_id, mp.course_id, mp.buyer_email,
              mp.buyer_first_name, mp.buyer_last_name, mp.external_reference,
              mp.account_created, mp.created_at,
              c.title AS course_title,
              u.first_name || ' ' || u.last_name AS instructor_name
       FROM manual_payments mp
       JOIN courses c ON c.id = mp.course_id
       JOIN users u ON u.id = c.instructor_id
       WHERE mp.status = 'pending' AND mp.origin = 'external_gateway'
       ORDER BY mp.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
  ]);

  return {
    payments: rowsRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page,
    limit,
  };
}

// ── Admin: approve a pending enrollment ─────────
async function approvePendingEnrollment(paymentId, adminId) {
  const { rows: paymentRows } = await db.query(
    `SELECT mp.*, c.title AS course_title
     FROM manual_payments mp
     JOIN courses c ON c.id = mp.course_id
     WHERE mp.id = $1 AND mp.status = 'pending'`,
    [paymentId]
  );
  if (!paymentRows[0]) throw ApiError.notFound('Pending payment not found');
  const payment = paymentRows[0];

  // Create enrollment and confirm payment in transaction
  const enrollment = await db.transaction(async (client) => {
    const { rows: enrRows } = await client.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id)
       DO UPDATE SET status = 'active', enrolled_at = NOW()
       RETURNING *`,
      [payment.user_id, payment.course_id]
    );
    await client.query(
      'UPDATE courses SET student_count = student_count + 1 WHERE id = $1',
      [payment.course_id]
    );
    await client.query(
      `UPDATE manual_payments
       SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(),
           enrollment_id = $2
       WHERE id = $3`,
      [adminId, enrRows[0].id, paymentId]
    );
    return enrRows[0];
  });

  // Send email
  try {
    const courseTitle = payment.course_title;
    if (payment.account_created) {
      const { rows: userRows } = await db.query(
        'SELECT first_name FROM users WHERE id = $1',
        [payment.user_id]
      );
      await sendMail({
        to: payment.buyer_email,
        subject: 'Your enrollment has been approved',
        html: welcomeCredentialsEmail({
          firstName: payment.buyer_first_name || 'Student',
          email: payment.buyer_email,
          tempPassword: 'Please check your email for login instructions',
          courseTitle,
        }),
      });
    } else {
      await sendMail({
        to: payment.buyer_email,
        subject: 'Course enrollment confirmed',
        html: enrollmentConfirmedEmail({
          firstName: payment.buyer_first_name || 'Student',
          courseTitle,
        }),
      });
    }
    await db.query(
      `UPDATE manual_payments SET credentials_email_sent = true, credentials_sent_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
  } catch (emailErr) {
    console.error('[Approval] Failed to send email:', emailErr.message);
  }

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
     VALUES ($1, 'enrollment.approved', 'manual_payment', $2, $3)`,
    [adminId, paymentId, JSON.stringify({ userId: payment.user_id, courseId: payment.course_id })]
  );

  eventBus.emit('enrollment.created', { userId: payment.user_id, courseId: payment.course_id });
  await adminService.invalidateAnalyticsCache();

  return {
    type: 'approved',
    enrollmentId: enrollment.id,
    userId: payment.user_id,
    courseId: payment.course_id,
  };
}

// ── Admin: reject a pending enrollment ──────────
async function rejectPendingEnrollment(paymentId, adminId, reason) {
  const { rows } = await db.query(
    `UPDATE manual_payments
     SET status = 'rejected', confirmed_by = $1, confirmed_at = NOW(),
         rejected_reason = $2
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [adminId, reason || null, paymentId]
  );
  if (!rows[0]) throw ApiError.notFound('Pending payment not found');

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
     VALUES ($1, 'enrollment.rejected', 'manual_payment', $2, $3)`,
    [adminId, paymentId, JSON.stringify({ reason: reason || null })]
  );

  await adminService.invalidateAnalyticsCache();

  return { type: 'rejected', paymentId };
}

module.exports = {
  enroll, myEnrollments, getEnrollment, listEnrollments,
  courseEnrollments, manualEnroll, revokeEnrollment,
  receiveWebhook,
  listPendingEnrollments, approvePendingEnrollment, rejectPendingEnrollment,
};
