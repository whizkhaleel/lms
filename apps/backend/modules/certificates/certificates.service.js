'use strict';

const db          = require('../../config/db');
const path        = require('path');
const fs          = require('fs');
const fsPromises  = require('fs/promises');
const PDFDocument = require('pdfkit');
const ApiError    = require('../../shared/utils/apiError');
const eventBus    = require('../../shared/events/eventBus');

const CERT_DIR = path.resolve(process.env.CERTIFICATES_DIR || '/app/lmsdata/certificates');

// ── Verify instructor/admin owns the course ──
async function verifyCourseOwner(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && rows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Access denied');
  }
}

// ── Generate a unique certificate number ──
async function nextCertificateNumber() {
  const { rows } = await db.query("SELECT nextval('seq_certificate_number') AS n");
  const num = rows[0].n;
  const yr = new Date().getFullYear();
  return `CERT-${yr}-${String(num).padStart(6, '0')}`;
}

// ── Generate PDF certificate ──
async function generateCertificatePdf(certNumber, userName, courseTitle, instructorName, courseDuration) {
  await fsPromises.mkdir(CERT_DIR, { recursive: true });
  const filePath = path.join(CERT_DIR, `${certNumber}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      layout: 'landscape',
      size: 'A4',
      info: {
        Title: `Certificate of Completion - ${courseTitle}`,
        Author: 'Shaheed Mahmoud Academy',
      },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth  = doc.page.width;
    const pageHeight = doc.page.height;
    const margin     = 40;

    // Background border
    doc.rect(margin, margin, pageWidth - 2 * margin, pageHeight - 2 * margin)
      .lineWidth(3).stroke('#1A6FBF');

    // Inner border
    doc.rect(margin + 10, margin + 10, pageWidth - 2 * (margin + 10), pageHeight - 2 * (margin + 10))
      .lineWidth(1).stroke('#3B9EE8');

    // Header
    doc.fontSize(14).fillColor('#666').text('CERTIFICATE OF COMPLETION', { align: 'center' });

    // Decorative line
    doc.moveTo(pageWidth / 2 - 120, 140)
      .lineTo(pageWidth / 2 + 120, 140)
      .stroke('#3B9EE8');

    // This certifies that
    doc.fontSize(12).fillColor('#888').text('This certifies that', { align: 'center' });

    // Student name
    doc.fontSize(36).fillColor('#1A6FBF').font('Helvetica-Bold')
      .text(userName, { align: 'center' });

    // Has completed the course
    doc.fontSize(12).fillColor('#888').font('Helvetica')
      .text('has successfully completed the course', { align: 'center' });

    // Course title
    doc.fontSize(24).fillColor('#222').font('Helvetica-Bold')
      .text(courseTitle, { align: 'center' });

    // Description
    doc.fontSize(11).fillColor('#666').font('Helvetica')
      .text(`Course Duration: ${courseDuration || 'N/A'}`, { align: 'center' });

    doc.moveDown(2);

    // Certificate number and date
    doc.fontSize(10).fillColor('#999')
      .text(`Certificate No: ${certNumber}`, { align: 'center' })
      .text(`Issued: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });

    doc.moveDown(3);

    // Instructor signature line
    doc.moveTo(150, pageHeight - 130)
      .lineTo(350, pageHeight - 130)
      .stroke('#999');
    doc.fontSize(10).fillColor('#666').text(instructorName || 'Instructor', 150, pageHeight - 120);
    doc.fontSize(9).fillColor('#999').text('Instructor', 150, pageHeight - 108);

    // Institution stamp line
    doc.moveTo(pageWidth - 350, pageHeight - 130)
      .lineTo(pageWidth - 150, pageHeight - 130)
      .stroke('#999');
    doc.fontSize(10).fillColor('#666').text('Shaheed Mahmoud Academy', pageWidth - 350, pageHeight - 120);
    doc.fontSize(9).fillColor('#999').text('Authorized Signature', pageWidth - 350, pageHeight - 108);

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// ── Issue certificate on course completion ──
async function issueCertificate(userId, courseId) {
  const { rows: courseRows } = await db.query(
    `SELECT c.title, c.duration_seconds,
            u.first_name || ' ' || u.last_name AS instructor_name
     FROM courses c
     JOIN users u ON u.id = c.instructor_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [courseId]
  );
  if (!courseRows[0]) throw ApiError.notFound('Course not found');

  const { rows: userRows } = await db.query(
    "SELECT first_name || ' ' || last_name AS full_name FROM users WHERE id = $1",
    [userId]
  );
  if (!userRows[0]) throw ApiError.notFound('User not found');

  // Check if certificate already exists
  const { rows: existing } = await db.query(
    'SELECT id FROM certificates WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  if (existing[0]) return existing[0]; // already issued

  const course    = courseRows[0];
  const userName  = userRows[0].full_name;
  const certNum   = await nextCertificateNumber();

  const durationHours = course.duration_seconds
    ? Math.round(course.duration_seconds / 3600) + ' hours'
    : null;

  const filePath = await generateCertificatePdf(certNum, userName, course.title, course.instructor_name, durationHours);
  const stat = fs.statSync(filePath);

  // Store in files table
  const { rows: fileRows } = await db.query(
    `INSERT INTO files (original_name, stored_name, storage_path, mime_type, size_bytes, sha256_hash, storage_backend, is_public, context, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, '', 'local', true, 'certificate', $6)
     RETURNING id`,
    [path.basename(filePath), path.basename(filePath), `certificates/${path.basename(filePath)}`, 'application/pdf', stat.size, userId]
  );
  const fileId = fileRows[0].id;

  // Create certificate record
  const { rows: certRows } = await db.query(
    `INSERT INTO certificates (user_id, course_id, file_id, certificate_number)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, courseId, fileId, certNum]
  );

  // Award XP for course completion
  await awardXp(userId, 500, 'course_complete', certRows[0].id);

  // Award badge
  const { rows: badgeRows } = await db.query(
    "SELECT id FROM badges WHERE badge_type = 'course_complete' LIMIT 1"
  );
  if (badgeRows[0]) {
    await db.query(
      'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, badgeRows[0].id]
    );
  }

  return certRows[0];
}

// ── XP system ─────────────────────────────────
async function awardXp(userId, amount, reason, referenceId = null) {
  // Insert transaction
  await db.query(
    `INSERT INTO xp_transactions (user_id, amount, reason, reference_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, amount, reason, referenceId]
  );

  // Update total and level
  const { rows } = await db.query(
    `UPDATE user_xp
     SET total_xp = total_xp + $2,
         level    = GREATEST(1, floor((total_xp + $2) / 1000) + 1),
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING total_xp, level`,
    [userId, amount]
  );

  if (!rows[0]) {
    // First XP for this user
    const newLevel = Math.max(1, Math.floor(amount / 1000) + 1);
    await db.query(
      'INSERT INTO user_xp (user_id, total_xp, level) VALUES ($1, $2, $3)',
      [userId, amount, newLevel]
    );
  }

  // Check for level-based badges
  const { rows: badgeRows } = await db.query(
    'SELECT id, name, xp_required FROM badges WHERE xp_required IS NOT NULL AND xp_required <= $1',
    [rows[0]?.total_xp || amount]
  );
  for (const badge of badgeRows) {
    await db.query(
      'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, badge.id]
    );
  }
}

// ── List certificates for a user ──
async function listUserCertificates(userId) {
  const { rows } = await db.query(
    `SELECT c.id, c.certificate_number, c.issued_at,
            co.title AS course_title, co.slug AS course_slug,
            f.id AS file_id, f.storage_path
     FROM certificates c
     JOIN courses co ON co.id = c.course_id
     LEFT JOIN files f ON f.id = c.file_id
     WHERE c.user_id = $1
     ORDER BY c.issued_at DESC`,
    [userId]
  );
  return rows;
}

// ── List all certificates for a course (instructor) ──
async function listCourseCertificates(courseId, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);
  const { rows } = await db.query(
    `SELECT c.id, c.certificate_number, c.issued_at,
            u.first_name || ' ' || u.last_name AS student_name, u.email,
            co.title AS course_title, f.id AS file_id, f.storage_path
     FROM certificates c
     JOIN users u ON u.id = c.user_id
     JOIN courses co ON co.id = c.course_id
     LEFT JOIN files f ON f.id = c.file_id
     WHERE c.course_id = $1
     ORDER BY c.issued_at DESC`,
    [courseId]
  );
  return rows;
}

// ── Get user XP and level ──
async function getUserXp(userId) {
  const { rows } = await db.query(
    `SELECT total_xp, level FROM user_xp WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || { total_xp: 0, level: 1 };
}

// ── Get user badges ──
async function getUserBadges(userId) {
  const { rows } = await db.query(
    `SELECT b.id, b.name, b.description, b.icon, b.badge_type, ub.earned_at
     FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = $1
     ORDER BY ub.earned_at DESC`,
    [userId]
  );
  return rows;
}

// ── Leaderboard ──
async function getLeaderboard({ limit = 50 } = {}) {
  const { rows } = await db.query(
    `SELECT u.id, u.first_name || ' ' || u.last_name AS full_name,
            ux.total_xp, ux.level,
            COUNT(ub.badge_id) AS badge_count
     FROM user_xp ux
     JOIN users u ON u.id = ux.user_id
     LEFT JOIN user_badges ub ON ub.user_id = ux.user_id
     WHERE u.deleted_at IS NULL
     GROUP BY u.id, u.first_name, u.last_name, ux.total_xp, ux.level
     ORDER BY ux.total_xp DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// ── Check and award streak badge ──
async function checkStreakBadge(userId, currentStreak) {
  let badgeType = null;
  if (currentStreak >= 30) badgeType = 'streak';
  else if (currentStreak >= 7) badgeType = 'streak';
  else return;

  const { rows } = await db.query(
    'SELECT id FROM badges WHERE badge_type = $1 LIMIT 1',
    [badgeType]
  );
  if (rows[0]) {
    await db.query(
      'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, rows[0].id]
    );
  }
}

// ── Award XP for lesson completion ──
async function awardLessonCompleteXp(userId, completedCount) {
  const amounts = { 1: 50, 5: 100, 25: 250, 50: 500 };
  // Always award 50 XP per lesson
  await awardXp(userId, 50, 'lesson_complete');

  // Milestone badges
  for (const [count, xp] of Object.entries(amounts)) {
    if (completedCount === parseInt(count)) {
      const { rows } = await db.query(
        "SELECT id FROM badges WHERE badge_type = 'milestone' AND name ILIKE '%" + count + "%' LIMIT 1"
      );
      if (rows[0]) {
        await db.query(
          'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, rows[0].id]
        );
      }
      await awardXp(userId, xp, 'milestone_' + count);
    }
  }

  // First lesson badge
  if (completedCount === 1) {
    const { rows } = await db.query(
      "SELECT id FROM badges WHERE badge_type = 'first_lesson' LIMIT 1"
    );
    if (rows[0]) {
      await db.query(
        'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, rows[0].id]
      );
    }
  }
}

// ── Award XP for quiz perfect score ──
async function awardQuizPerfectXp(userId, quizId) {
  const { rows } = await db.query(
    "SELECT id FROM badges WHERE badge_type = 'quiz_perfect' LIMIT 1"
  );
  if (rows[0]) {
    await db.query(
      'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, rows[0].id]
    );
  }
  await awardXp(userId, 200, 'quiz_perfect', quizId);
}

// ── Award XP for streak ──
async function awardStreakXp(userId, currentStreak) {
  // 10 XP per day of streak
  await awardXp(userId, currentStreak * 10, 'streak');
  await checkStreakBadge(userId, currentStreak);
}

module.exports = {
  issueCertificate,
  listUserCertificates,
  listCourseCertificates,
  getUserXp,
  getUserBadges,
  getLeaderboard,
  awardXp,
  awardLessonCompleteXp,
  awardQuizPerfectXp,
  awardStreakXp,
  checkStreakBadge,
};
