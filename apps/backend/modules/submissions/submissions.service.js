'use strict';

const db          = require('../../config/db');
const ApiError    = require('../../shared/utils/apiError');
const eventBus    = require('../../shared/events/eventBus');
const fileService = require('../files/files.service');

// ─────────────────────────────────────────────
//  ASSIGNMENT & SUBMISSION ENGINE
// ─────────────────────────────────────────────

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

async function verifyEnrolled(userId, courseId) {
  const { rows } = await db.query(
    `SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2 AND status='active'`,
    [userId, courseId]
  );
  if (!rows[0]) throw ApiError.forbidden('You must be enrolled to submit this assignment');
}

// ─────────────────────────────────────────────
//  ASSIGNMENT CRUD (Instructor)
// ─────────────────────────────────────────────

async function createAssignment(lessonId, courseId, data, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);

  const { rows: lRows } = await db.query(
    'SELECT id, type FROM lessons WHERE id=$1 AND course_id=$2 AND deleted_at IS NULL',
    [lessonId, courseId]
  );
  if (!lRows[0]) throw ApiError.notFound('Lesson not found');
  if (lRows[0].type !== 'assignment') {
    throw ApiError.badRequest('Lesson type must be "assignment" to attach an assignment');
  }

  const { rows } = await db.query(
    `INSERT INTO assignments
       (lesson_id, course_id, title, instructions, max_score, passing_score,
        allow_text_submission, allow_file_submission,
        max_file_size_mb, allowed_file_types, max_files, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      lessonId, courseId, data.title, data.instructions || null,
      data.maxScore ?? 100, data.passingScore ?? 50,
      data.allowTextSubmission ?? true, data.allowFileSubmission ?? true,
      data.maxFileSizeMb ?? 50,
      data.allowedFileTypes ? `{${data.allowedFileTypes.join(',')}}` : null,
      data.maxFiles ?? 3,
      data.dueDate || null,
    ]
  );
  return rows[0];
}

async function updateAssignment(assignmentId, data, requestingUser) {
  const { rows } = await db.query(
    `SELECT a.*, c.instructor_id FROM assignments a
     JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
    [assignmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Assignment not found');
  if (requestingUser.role !== 'admin' && rows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Access denied');
  }

  const { rows: updated } = await db.query(
    `UPDATE assignments SET
       title                 = COALESCE($1,  title),
       instructions          = COALESCE($2,  instructions),
       max_score             = COALESCE($3,  max_score),
       passing_score         = COALESCE($4,  passing_score),
       allow_text_submission = COALESCE($5,  allow_text_submission),
       allow_file_submission = COALESCE($6,  allow_file_submission),
       max_file_size_mb      = COALESCE($7,  max_file_size_mb),
       max_files             = COALESCE($8,  max_files),
       due_date              = COALESCE($9,  due_date),
       is_published          = COALESCE($10, is_published),
       updated_at            = NOW()
     WHERE id = $11 RETURNING *`,
    [
      data.title, data.instructions, data.maxScore, data.passingScore,
      data.allowTextSubmission, data.allowFileSubmission,
      data.maxFileSizeMb, data.maxFiles, data.dueDate,
      data.isPublished, assignmentId,
    ]
  );
  return updated[0];
}

async function getAssignment(assignmentId, requestingUser) {
  const { rows } = await db.query(
    `SELECT a.*, c.instructor_id,
            u.first_name || ' ' || u.last_name AS instructor_name
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN users u ON u.id = c.instructor_id
     WHERE a.id = $1`,
    [assignmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Assignment not found');

  const isOwner = requestingUser.role === 'admin' ||
    rows[0].instructor_id === requestingUser.id;

  // Students see published only
  if (!isOwner && !rows[0].is_published) {
    throw ApiError.notFound('Assignment not found');
  }
  return rows[0];
}

// ─────────────────────────────────────────────
//  SUBMISSIONS (Student)
// ─────────────────────────────────────────────

async function submitAssignment(assignmentId, userId, textContent, uploadedFiles) {
  // 1. Load assignment
  const { rows: aRows } = await db.query(
    'SELECT * FROM assignments WHERE id=$1 AND is_published=true',
    [assignmentId]
  );
  const assignment = aRows[0];
  if (!assignment) throw ApiError.notFound('Assignment not found');

  await verifyEnrolled(userId, assignment.course_id);

  // 2. Validate due date
  if (assignment.due_date && new Date() > new Date(assignment.due_date)) {
    throw ApiError.badRequest('The submission deadline has passed');
  }

  // 3. Validate content
  if (!textContent && (!uploadedFiles || uploadedFiles.length === 0)) {
    throw ApiError.badRequest('Submission must include text or at least one file');
  }
  if (textContent && !assignment.allow_text_submission) {
    throw ApiError.badRequest('Text submissions are not allowed for this assignment');
  }
  if (uploadedFiles?.length > 0 && !assignment.allow_file_submission) {
    throw ApiError.badRequest('File submissions are not allowed for this assignment');
  }
  if (uploadedFiles?.length > assignment.max_files) {
    throw ApiError.badRequest(`Maximum ${assignment.max_files} files allowed`);
  }

  // 4. Handle attempt number
  const { rows: prevRows } = await db.query(
    'SELECT MAX(attempt_number) AS max FROM assignment_submissions WHERE assignment_id=$1 AND user_id=$2',
    [assignmentId, userId]
  );
  const attemptNumber = (parseInt(prevRows[0]?.max || 0, 10)) + 1;

  // 5. Save uploaded files
  const fileIds = [];
  for (const file of (uploadedFiles || [])) {
    const saved = await fileService.saveFile({
      uploadedFile: file,
      context:      'assignment_submission',
      ownerId:      assignmentId,
      uploadedBy:   userId,
      isPublic:     false,
    });
    fileIds.push(saved.id);
  }

  // 6. Create submission
  const { rows } = await db.query(
    `INSERT INTO assignment_submissions
       (assignment_id, user_id, course_id, text_content, file_ids,
        status, attempt_number)
     VALUES ($1,$2,$3,$4,$5,'submitted',$6)
     RETURNING *`,
    [
      assignmentId, userId, assignment.course_id,
      textContent || null,
      JSON.stringify(fileIds),
      attemptNumber,
    ]
  );

  eventBus.emit('assignment.submitted', {
    submissionId: rows[0].id,
    userId, assignmentId,
    courseId: assignment.course_id,
  });

  return rows[0];
}

async function getMySubmission(assignmentId, userId) {
  const { rows } = await db.query(
    `SELECT s.*, a.max_score, a.passing_score, a.title AS assignment_title
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     WHERE s.assignment_id = $1 AND s.user_id = $2
     ORDER BY s.attempt_number DESC`,
    [assignmentId, userId]
  );
  return rows;
}

// ─────────────────────────────────────────────
//  GRADING (Instructor)
// ─────────────────────────────────────────────

async function gradeSubmission(submissionId, score, feedback, requestingUser) {
  const { rows } = await db.query(
    `SELECT s.*, a.max_score, a.passing_score, a.lesson_id, c.instructor_id
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN courses c ON c.id = s.course_id
     WHERE s.id = $1`,
    [submissionId]
  );
  const sub = rows[0];
  if (!sub) throw ApiError.notFound('Submission not found');
  if (requestingUser.role !== 'admin' && sub.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Access denied');
  }
  if (score > sub.max_score) {
    throw ApiError.badRequest(`Score cannot exceed max score of ${sub.max_score}`);
  }

  const scorePct = Math.round((score / sub.max_score) * 100);
  const passed   = score >= sub.passing_score;

  await db.transaction(async (client) => {
    // Update submission
    await client.query(
      `UPDATE assignment_submissions SET
         score = $1, feedback = $2, status = 'graded',
         graded_by = $3, graded_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [score, feedback || null, requestingUser.id, submissionId]
    );

    // Upsert unified grade record
    await client.query(
      `INSERT INTO grades
         (user_id, course_id, lesson_id, submission_id, grade_type,
          score, max_score, score_pct, passed)
       VALUES ($1,$2,$3,$4,'assignment',$5,$6,$7,$8)
       ON CONFLICT (user_id, lesson_id, grade_type) DO UPDATE SET
         score=$5, max_score=$6, score_pct=$7,
         passed=$8, submission_id=$4, graded_at=NOW()`,
      [sub.user_id, sub.course_id, sub.lesson_id,
       submissionId, score, sub.max_score, scorePct, passed]
    );
  });

  eventBus.emit('assignment.graded', {
    submissionId,
    userId: sub.user_id,
    courseId: sub.course_id,
    score, passed,
  });

  return { submissionId, score, scorePct, passed };
}

async function listSubmissions(assignmentId, requestingUser) {
  const { rows: aRows } = await db.query(
    `SELECT a.course_id, c.instructor_id FROM assignments a
     JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
    [assignmentId]
  );
  if (!aRows[0]) throw ApiError.notFound('Assignment not found');
  if (requestingUser.role !== 'admin' && aRows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Access denied');
  }

  const { rows } = await db.query(
    `SELECT s.id, s.user_id, s.status, s.score, s.feedback,
            s.submitted_at, s.graded_at, s.attempt_number,
            u.email, u.first_name, u.last_name
     FROM assignment_submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.assignment_id = $1
     ORDER BY s.submitted_at DESC`,
    [assignmentId]
  );
  return rows;
}

async function getSubmissionDetail(submissionId, requestingUser) {
  const { rows } = await db.query(
    `SELECT s.*, a.title AS assignment_title, a.max_score, a.passing_score,
            c.instructor_id,
            u.email, u.first_name, u.last_name
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN courses c ON c.id = s.course_id
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [submissionId]
  );
  const sub = rows[0];
  if (!sub) throw ApiError.notFound('Submission not found');

  const canView = requestingUser.role === 'admin' ||
    sub.instructor_id === requestingUser.id ||
    sub.user_id === requestingUser.id;
  if (!canView) throw ApiError.forbidden('Access denied');

  return sub;
}

// ─────────────────────────────────────────────
//  GRADEBOOK (Student / Instructor view)
// ─────────────────────────────────────────────

async function getGradebook(courseId, targetUserId, requestingUser) {
  // Student can only see their own; instructor sees any
  if (requestingUser.role === 'student' && requestingUser.id !== targetUserId) {
    throw ApiError.forbidden('Access denied');
  }

  const { rows } = await db.query(
    `SELECT
       g.id, g.grade_type, g.score, g.max_score, g.score_pct, g.passed, g.graded_at,
       l.title AS lesson_title, l.type AS lesson_type,
       s.title AS section_title
     FROM grades g
     JOIN lessons l ON l.id = g.lesson_id
     JOIN sections s ON s.id = l.section_id
     WHERE g.user_id = $1 AND g.course_id = $2
     ORDER BY s.sort_order, l.sort_order`,
    [targetUserId, courseId]
  );

  const totalScore = rows.reduce((sum, g) => sum + parseFloat(g.score), 0);
  const maxScore   = rows.reduce((sum, g) => sum + parseFloat(g.max_score), 0);
  const overallPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  return {
    grades: rows,
    summary: {
      totalScore,
      maxScore,
      overallPct,
      gradedItems: rows.length,
      passed: rows.filter(g => g.passed).length,
      failed: rows.filter(g => !g.passed).length,
    },
  };
}

module.exports = {
  createAssignment, updateAssignment, getAssignment,
  submitAssignment, getMySubmission,
  gradeSubmission, listSubmissions, getSubmissionDetail,
  getGradebook,
};