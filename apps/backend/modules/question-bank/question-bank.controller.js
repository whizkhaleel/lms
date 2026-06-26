'use strict';

const Joi         = require('joi');
const service     = require('./question-bank.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const categorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
});

const questionSchema = Joi.object({
  categoryId:   Joi.string().uuid().required(),
  type:         Joi.string().valid('multiple_choice','multi_select','true_false','short_answer').required(),
  questionText: Joi.string().trim().min(1).required(),
  options:      Joi.array().items(Joi.object({
    id:         Joi.string().required(),
    text:       Joi.string().required(),
    is_correct: Joi.boolean().required(),
  })).when('type', { is: 'short_answer', then: Joi.optional(), otherwise: Joi.required() }),
  modelAnswer:  Joi.string().allow('', null),
  explanation:  Joi.string().allow('', null),
  points:       Joi.number().integer().min(1),
});

const updateQuestionSchema = Joi.object({
  type:         Joi.string().valid('multiple_choice','multi_select','true_false','short_answer'),
  questionText: Joi.string().trim().min(1),
  options:      Joi.array().items(Joi.object({
    id:         Joi.string().required(),
    text:       Joi.string().required(),
    is_correct: Joi.boolean().required(),
  })),
  modelAnswer:  Joi.string().allow('', null),
  explanation:  Joi.string().allow('', null),
  points:       Joi.number().integer().min(1),
}).min(1);

const importSchema = Joi.object({
  questionIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

// ── Categories ────────────────────────────────

async function listCategories(req, res, next) {
  try {
    const cats = await service.listCategories(req.params.courseId);
    ApiResponse.success(res, { categories: cats });
  } catch (err) { next(err); }
}

async function createCategory(req, res, next) {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const cat = await service.createCategory(req.params.courseId, value, req.user);
    ApiResponse.created(res, { category: cat }, 'Category created');
  } catch (err) { next(err); }
}

async function updateCategory(req, res, next) {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const cat = await service.updateCategory(req.params.courseId, req.params.categoryId, value, req.user);
    ApiResponse.success(res, { category: cat }, 'Category updated');
  } catch (err) { next(err); }
}

async function removeCategory(req, res, next) {
  try {
    await service.deleteCategory(req.params.courseId, req.params.categoryId, req.user);
    ApiResponse.success(res, null, 'Category deleted');
  } catch (err) { next(err); }
}

// ── Questions ─────────────────────────────────

async function listQuestions(req, res, next) {
  try {
    const qs = await service.listQuestions(req.params.courseId, req.query);
    ApiResponse.success(res, { questions: qs });
  } catch (err) { next(err); }
}

async function createQuestion(req, res, next) {
  try {
    const { error, value } = questionSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const q = await service.createQuestion(req.params.courseId, value, req.user);
    ApiResponse.created(res, { question: q }, 'Question created');
  } catch (err) { next(err); }
}

async function updateQuestion(req, res, next) {
  try {
    const { error, value } = updateQuestionSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const q = await service.updateQuestion(req.params.courseId, req.params.questionId, value, req.user);
    ApiResponse.success(res, { question: q }, 'Question updated');
  } catch (err) { next(err); }
}

async function removeQuestion(req, res, next) {
  try {
    await service.deleteQuestion(req.params.courseId, req.params.questionId, req.user);
    ApiResponse.success(res, null, 'Question deleted');
  } catch (err) { next(err); }
}

// ── Import ────────────────────────────────────

async function importQuestions(req, res, next) {
  try {
    const { error, value } = importSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const result = await service.importQuestions(req.params.quizId, value, req.user);
    ApiResponse.success(res, result, `${result.imported} question(s) imported`);
  } catch (err) { next(err); }
}

module.exports = {
  listCategories, createCategory, updateCategory, removeCategory,
  listQuestions, createQuestion, updateQuestion, removeQuestion,
  importQuestions,
};
