'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

async function verifyCourseInstructor(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1',
    [courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Course not found');
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === rows[0].instructor_id;
  if (!isOwner) throw ApiError.forbidden('Not authorized for this course');
  return rows[0];
}

// ── Categories ────────────────────────────────

async function listCategories(courseId) {
  const { rows } = await db.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM question_bank q WHERE q.category_id = c.id)::int AS question_count
     FROM question_bank_categories c
     WHERE c.course_id = $1
     ORDER BY c.name`,
    [courseId]
  );
  return rows;
}

async function createCategory(courseId, { name }, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rows } = await db.query(
    `INSERT INTO question_bank_categories (course_id, name)
     VALUES ($1, $2) RETURNING *`,
    [courseId, name]
  );
  return rows[0];
}

async function updateCategory(courseId, categoryId, { name }, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rows } = await db.query(
    `UPDATE question_bank_categories SET name = $1, updated_at = NOW()
     WHERE id = $2 AND course_id = $3 RETURNING *`,
    [name, categoryId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Category not found');
  return rows[0];
}

async function deleteCategory(courseId, categoryId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rowCount } = await db.query(
    'DELETE FROM question_bank_categories WHERE id = $1 AND course_id = $2',
    [categoryId, courseId]
  );
  if (rowCount === 0) throw ApiError.notFound('Category not found');
}

// ── Questions ─────────────────────────────────

async function listQuestions(courseId, { categoryId } = {}) {
  const { rows } = await db.query(
    `SELECT q.*, c.name AS category_name
     FROM question_bank q
     JOIN question_bank_categories c ON c.id = q.category_id
     WHERE c.course_id = $1
     ${categoryId ? 'AND q.category_id = $2' : ''}
     ORDER BY c.name, q.created_at DESC`,
    categoryId ? [courseId, categoryId] : [courseId]
  );
  return rows;
}

async function createQuestion(courseId, data, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  // Verify category exists and belongs to course
  const { rows: catRows } = await db.query(
    'SELECT id FROM question_bank_categories WHERE id = $1 AND course_id = $2',
    [data.categoryId, courseId]
  );
  if (!catRows[0]) throw ApiError.notFound('Category not found');

  // Validate options for non-short_answer types
  if (data.type !== 'short_answer') {
    if (!data.options || data.options.length < 2) {
      throw ApiError.badRequest('At least 2 options required');
    }
    const correctCount = data.options.filter(o => o.is_correct).length;
    if (correctCount === 0) throw ApiError.badRequest('At least one correct option required');
    if ((data.type === 'multiple_choice' || data.type === 'true_false') && correctCount !== 1) {
      throw ApiError.badRequest('Exactly one correct option required for this question type');
    }
  }

  const { rows } = await db.query(
    `INSERT INTO question_bank (category_id, type, question_text, options, model_answer, explanation, points)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.categoryId, data.type, data.questionText,
      JSON.stringify(data.options || []),
      data.modelAnswer || null, data.explanation || null,
      data.points || 1,
    ]
  );
  return rows[0];
}

async function updateQuestion(courseId, questionId, data, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  const { rows } = await db.query(
    `UPDATE question_bank
     SET type = COALESCE($1, type),
         question_text = COALESCE($2, question_text),
         options = COALESCE($3, options),
         model_answer = COALESCE($4, model_answer),
         explanation = COALESCE($5, explanation),
         points = COALESCE($6, points),
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      data.type, data.questionText,
      data.options ? JSON.stringify(data.options) : null,
      data.modelAnswer, data.explanation,
      data.points, questionId,
    ]
  );
  if (!rows[0]) throw ApiError.notFound('Question not found');
  return rows[0];
}

async function deleteQuestion(courseId, questionId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rowCount } = await db.query(
    `DELETE FROM question_bank
     WHERE id = $1 AND category_id IN (SELECT id FROM question_bank_categories WHERE course_id = $2)`,
    [questionId, courseId]
  );
  if (rowCount === 0) throw ApiError.notFound('Question not found');
}

// ── Import ────────────────────────────────────

async function importQuestions(quizId, { questionIds }, requestingUser) {
  // Verify quiz ownership
  const { rows: quizRows } = await db.query(
    `SELECT q.id, q.lesson_id, l.course_id, c.instructor_id
     FROM quizzes q
     JOIN lessons l ON l.id = q.lesson_id
     JOIN courses c ON c.id = l.course_id
     WHERE q.id = $1`,
    [quizId]
  );
  if (!quizRows[0]) throw ApiError.notFound('Quiz not found');
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === quizRows[0].instructor_id;
  if (!isOwner) throw ApiError.forbidden('Not authorized');

  // Fetch max sort_order
  const { rows: sortRows } = await db.query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM quiz_questions WHERE quiz_id = $1',
    [quizId]
  );
  let sortOrder = sortRows[0].max_sort + 1;

  // Load bank questions
  const { rows: bankQuestions } = await db.query(
    'SELECT * FROM question_bank WHERE id = ANY($1::uuid[])',
    [questionIds]
  );

  if (bankQuestions.length === 0) throw ApiError.notFound('No questions found');

  let imported = 0;
  for (const q of bankQuestions) {
    await db.query(
      `INSERT INTO quiz_questions (quiz_id, type, question_text, options, model_answer, explanation, points, sort_order)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [quizId, q.type, q.question_text, JSON.stringify(q.options), q.model_answer, q.explanation, q.points, sortOrder++]
    );
    imported++;
  }

  return { imported };
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  importQuestions,
};
