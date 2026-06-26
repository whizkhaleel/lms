'use strict';

const Joi         = require('joi');
const service     = require('./rubrics.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const criterionSchema = Joi.object({
  id:          Joi.string().uuid().optional(),
  description: Joi.string().trim().min(1).max(2000).required(),
  max_score:   Joi.number().min(0).max(99999).required(),
});

const rubricSchema = Joi.object({
  name:        Joi.string().trim().max(255).allow('').default(''),
  description: Joi.string().trim().max(5000).allow('').default(''),
  criteria:    Joi.array().items(criterionSchema).min(1).optional(),
});

const gradeRubricSchema = Joi.object({
  scores:   Joi.object().pattern(Joi.string().uuid(), Joi.number().min(0)).required(),
  feedback: Joi.string().trim().max(5000).allow('').optional(),
});

async function getRubric(req, res, next) {
  try {
    const rubric = await service.getRubric(req.params.assignmentId);
    ApiResponse.success(res, { rubric });
  } catch (err) {
    next(err);
  }
}

async function saveRubric(req, res, next) {
  try {
    const { error, value } = rubricSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    }
    const rubric = await service.saveRubric(req.params.assignmentId, value, req.user);
    ApiResponse.success(res, { rubric }, 'Rubric saved');
  } catch (err) {
    next(err);
  }
}

async function getFeedback(req, res, next) {
  try {
    const feedback = await service.getSubmissionFeedback(req.params.submissionId);
    ApiResponse.success(res, { feedback });
  } catch (err) {
    next(err);
  }
}

async function gradeWithRubric(req, res, next) {
  try {
    const { error, value } = gradeRubricSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    }
    const result = await service.gradeWithRubric(req.params.submissionId, value, req.user);
    ApiResponse.success(res, result, 'Submission graded with rubric');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRubric,
  saveRubric,
  getFeedback,
  gradeWithRubric,
};
