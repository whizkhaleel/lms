'use strict';

const express      = require('express');
const router       = express.Router({ mergeParams: true });
const controller   = require('./question-bank.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);
router.use(authorize('instructor','admin'));

// ── Categories ────────────────────────────────
router.get   ('/categories',                controller.listCategories);
router.post  ('/categories',                controller.createCategory);
router.patch ('/categories/:categoryId',    controller.updateCategory);
router.delete('/categories/:categoryId',    controller.removeCategory);

// ── Questions ─────────────────────────────────
router.get   ('/questions',                 controller.listQuestions);
router.post  ('/questions',                 controller.createQuestion);
router.patch ('/questions/:questionId',     controller.updateQuestion);
router.delete('/questions/:questionId',     controller.removeQuestion);

// ── Import (scoped to a quiz) ─────────────────
const service     = require('./question-bank.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const Joi         = require('joi');

const importSchema = Joi.object({
  questionIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

async function importQuestions(req, res, next) {
  try {
    const { error, value } = importSchema.validate(req.body);
    if (error) {
      const ApiError = require('../../shared/utils/apiError');
      throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    }
    const result = await service.importQuestions(req.params.quizId, value, req.user);
    ApiResponse.success(res, result, `${result.imported} question(s) imported`);
  } catch (err) { next(err); }
}

router.post('/quizzes/:quizId/import', importQuestions);

module.exports = router;
