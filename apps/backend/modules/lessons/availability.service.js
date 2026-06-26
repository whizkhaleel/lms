'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

// ── Condition evaluation engine ─────────────────
// Supported condition types:
//   lesson_completed  — { type: 'lesson_completed',  lessonId: 'uuid' }
//   quiz_score        — { type: 'quiz_score',        lessonId: 'uuid', minScore: 80 }
//   date_range        — { type: 'date_range',        start: 'ISO', end: 'ISO' }
//
// If lesson has no availability row → accessible.
// If conditions array is empty → accessible.
// Otherwise ALL conditions must pass (AND logic).

async function evaluateConditions(userId, conditions) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return { accessible: true, reasons: [] };
  }

  const failures = [];

  for (const cond of conditions) {
    switch (cond.type) {
      case 'lesson_completed': {
        const { rows } = await db.query(
          `SELECT is_completed FROM lesson_progress
           WHERE user_id = $1 AND lesson_id = $2`,
          [userId, cond.lessonId]
        );
        if (!rows[0]?.is_completed) {
          failures.push(`Must complete a prerequisite lesson`);
        }
        break;
      }

      case 'quiz_score': {
        const { rows } = await db.query(
          `SELECT score_pct FROM grades
           WHERE user_id = $1 AND lesson_id = $2 AND grade_type = 'quiz'
           ORDER BY graded_at DESC LIMIT 1`,
          [userId, cond.lessonId]
        );
        const score = rows[0]?.score_pct ?? 0;
        if (Number(score) < Number(cond.minScore)) {
          failures.push(`Requires quiz score of at least ${cond.minScore}%`);
        }
        break;
      }

      case 'date_range': {
        const now = new Date();
        if (cond.start && new Date(cond.start) > now) {
          failures.push(`Available from ${new Date(cond.start).toLocaleDateString()}`);
        } else if (cond.end && new Date(cond.end) < now) {
          failures.push(`Was available until ${new Date(cond.end).toLocaleDateString()}`);
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    accessible: failures.length === 0,
    reasons: failures,
  };
}

// ── Upsert conditions for a lesson ──────────────
async function setAvailability(lessonId, courseId, conditions, requestingUser) {
  // Verify the lesson exists in this course
  const { rows } = await db.query(
    'SELECT id FROM lessons WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL',
    [lessonId, courseId]
  );
  if (!rows[0]) {
    throw ApiError.notFound('Lesson not found in this course');
  }

  // Verify course ownership
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!courseRows[0]) {
    throw ApiError.notFound('Course not found');
  }
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === courseRows[0].instructor_id;
  if (!isOwner) {
    throw ApiError.forbidden('You do not have permission to modify this lesson');
  }

  const { rows: result } = await db.query(
    `INSERT INTO lesson_availability (lesson_id, conditions)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (lesson_id)
     DO UPDATE SET conditions = $2::jsonb, updated_at = NOW()
     RETURNING *`,
    [lessonId, JSON.stringify(conditions || [])]
  );

  return result[0];
}

// ── Get availability for a lesson ───────────────
async function getAvailability(lessonId) {
  const { rows } = await db.query(
    'SELECT * FROM lesson_availability WHERE lesson_id = $1',
    [lessonId]
  );
  return rows[0] || null;
}

// ── Get availability for all lessons in a course ─
async function getCourseAvailability(courseId) {
  const { rows } = await db.query(
    `SELECT la.lesson_id, la.conditions
     FROM lesson_availability la
     JOIN lessons l ON l.id = la.lesson_id
     WHERE l.course_id = $1 AND l.deleted_at IS NULL`,
    [courseId]
  );
  return rows;
}

// ── Evaluate availability for all lessons in a course for a user ──
async function evaluateCourseAvailability(userId, courseId) {
  const availRows = await getCourseAvailability(courseId);
  const results = {};

  for (const row of availRows) {
    const evaluation = await evaluateConditions(userId, row.conditions);
    results[row.lesson_id] = {
      accessible: evaluation.accessible,
      reasons: evaluation.reasons,
    };
  }

  return results;
}

module.exports = {
  evaluateConditions,
  setAvailability,
  getAvailability,
  getCourseAvailability,
  evaluateCourseAvailability,
};
