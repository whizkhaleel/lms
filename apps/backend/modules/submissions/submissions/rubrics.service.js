'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

// ── Helpers ─────────────────────────────────────
async function verifyAssignmentOwner(assignmentId, requestingUser) {
  const { rows } = await db.query(
    `SELECT a.id, a.course_id, c.instructor_id
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = $1`,
    [assignmentId]
  );
  if (!rows[0]) throw ApiError.notFound('Assignment not found');
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === rows[0].instructor_id;
  if (!isOwner) throw ApiError.forbidden('Not authorized to modify this assignment');
  return rows[0];
}

async function verifySubmissionAccess(submissionId, requestingUser) {
  const { rows } = await db.query(
    `SELECT s.id, s.assignment_id, s.user_id, a.course_id, a.lesson_id, c.instructor_id
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN courses c ON c.id = a.course_id
     WHERE s.id = $1`,
    [submissionId]
  );
  if (!rows[0]) throw ApiError.notFound('Submission not found');
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === rows[0].instructor_id;
  if (!isOwner) throw ApiError.forbidden('Not authorized');
  return rows[0];
}

// ── Get rubric for an assignment ────────────────
async function getRubric(assignmentId) {
  const { rows: rubricRows } = await db.query(
    'SELECT * FROM assignment_rubrics WHERE assignment_id = $1',
    [assignmentId]
  );
  if (!rubricRows[0]) return null;

  const { rows: criteria } = await db.query(
    'SELECT * FROM rubric_criteria WHERE rubric_id = $1 ORDER BY sort_order',
    [rubricRows[0].id]
  );

  return { ...rubricRows[0], criteria };
}

// ── Save/update rubric for an assignment ────────
async function saveRubric(assignmentId, { name, description, criteria }, requestingUser) {
  const assignment = await verifyAssignmentOwner(assignmentId, requestingUser);

  const totalMax = (criteria || []).reduce((sum, c) => sum + (c.max_score || 0), 0);

  const { rows: rubricRows } = await db.query(
    `INSERT INTO assignment_rubrics (assignment_id, name, description, max_score)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (assignment_id)
     DO UPDATE SET name = $2, description = $3, max_score = $4, updated_at = NOW()
     RETURNING *`,
    [assignmentId, name || '', description || '', totalMax]
  );
  const rubric = rubricRows[0];

  // Delete removed criteria, then upsert the rest
  await db.query('DELETE FROM rubric_criteria WHERE rubric_id = $1', [rubric.id]);

  if (criteria && criteria.length > 0) {
    const values = criteria.map((c, i) =>
      `(${[
        `'${rubric.id}'`,
        `'${(c.description || '').replace(/'/g, "''")}'`,
        c.max_score || 0,
        i,
      ].join(',')})`
    ).join(', ');

    await db.query(
      `INSERT INTO rubric_criteria (rubric_id, description, max_score, sort_order)
       VALUES ${values}`
    );

    // Recalculate max_score from actual inserted values
    const { rows: sumRows } = await db.query(
      'SELECT COALESCE(SUM(max_score), 0) AS total FROM rubric_criteria WHERE rubric_id = $1',
      [rubric.id]
    );
    await db.query(
      'UPDATE assignment_rubrics SET max_score = $1 WHERE id = $2',
      [sumRows[0].total, rubric.id]
    );
  }

  return getRubric(assignmentId);
}

// ── Get rubric feedback for a submission ────────
async function getSubmissionFeedback(submissionId) {
  const { rows } = await db.query(
    `SELECT rf.*, rc.description, rc.max_score AS criterion_max_score
     FROM rubric_feedback rf
     JOIN rubric_criteria rc ON rc.id = rf.criterion_id
     WHERE rf.submission_id = $1
     ORDER BY rc.sort_order`,
    [submissionId]
  );
  return rows;
}

// ── Grade a submission with rubric ──────────────
async function gradeWithRubric(submissionId, { scores, feedback }, requestingUser) {
  const submission = await verifySubmissionAccess(submissionId, requestingUser);

  const rubric = await getRubricByAssignment(submission.assignment_id);
  if (!rubric) throw ApiError.badRequest('No rubric defined for this assignment');

  // Validate and save per-criterion scores
  const criterionMap = {};
  rubric.criteria.forEach(c => { criterionMap[c.id] = c; });

  if (!scores || typeof scores !== 'object') {
    throw ApiError.badRequest('scores object mapping criterionId -> score is required');
  }

  let totalScore = 0;
  const feedbackEntries = [];

  for (const criterion of rubric.criteria) {
    const score = scores[criterion.id];
    if (score === undefined || score === null) {
      throw ApiError.badRequest(`Missing score for criterion "${criterion.description || criterion.id}"`);
    }
    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0 || numScore > Number(criterion.max_score)) {
      throw ApiError.badRequest(
        `Score for "${criterion.description}" must be between 0 and ${criterion.max_score}`
      );
    }
    totalScore += numScore;
    feedbackEntries.push({ criterionId: criterion.id, score: numScore });
  }

  const maxScore = Number(rubric.max_score);
  const scorePct = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  // Also check assignment's passing score
  const { rows: assignRows } = await db.query(
    'SELECT passing_score, max_score AS assign_max_score FROM assignments WHERE id = $1',
    [submission.assignment_id]
  );
  const assignMax = assignRows[0]?.assign_max_score || maxScore;
  const passingScore = assignRows[0]?.passing_score || 0;
  const assignScorePct = assignMax > 0 ? Math.round((totalScore / assignMax) * 10000) / 100 : 0;
  const passed = assignScorePct >= passingScore;

  await db.transaction(async (client) => {
    // Delete existing feedback for this submission
    await client.query('DELETE FROM rubric_feedback WHERE submission_id = $1', [submissionId]);

    // Insert new feedback
    for (const entry of feedbackEntries) {
      await client.query(
        `INSERT INTO rubric_feedback (submission_id, criterion_id, score)
         VALUES ($1, $2, $3)`,
        [submissionId, entry.criterionId, entry.score]
      );
    }

    // Update submission with score
    await client.query(
      `UPDATE assignment_submissions
       SET score = $1, feedback = $2, status = 'graded',
           graded_by = $3, graded_at = NOW()
       WHERE id = $4`,
      [totalScore, feedback || null, requestingUser.id, submissionId]
    );

    // Upsert grades
    await client.query(
      `INSERT INTO grades (user_id, course_id, lesson_id, submission_id, grade_type,
                           score, max_score, score_pct, passed, graded_at)
       VALUES ($1, $2, $3, $4, 'assignment', $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, lesson_id, grade_type)
       DO UPDATE SET score = $5, max_score = $6, score_pct = $7,
                     passed = $8, graded_at = NOW(), updated_at = NOW()`,
      [
        submission.user_id, submission.course_id, submission.lesson_id, submissionId,
        totalScore, maxScore, scorePct, passed,
      ]
    );
  });

  return {
    totalScore,
    maxScore,
    scorePct,
    passingScore,
    passed,
    feedback: feedback || null,
    scores: feedbackEntries,
  };
}

async function getRubricByAssignment(assignmentId) {
  const { rows: rubricRows } = await db.query(
    'SELECT * FROM assignment_rubrics WHERE assignment_id = $1',
    [assignmentId]
  );
  if (!rubricRows[0]) return null;

  const { rows: criteria } = await db.query(
    'SELECT * FROM rubric_criteria WHERE rubric_id = $1 ORDER BY sort_order',
    [rubricRows[0].id]
  );

  return { ...rubricRows[0], criteria };
}

module.exports = {
  getRubric,
  saveRubric,
  getSubmissionFeedback,
  gradeWithRubric,
};
