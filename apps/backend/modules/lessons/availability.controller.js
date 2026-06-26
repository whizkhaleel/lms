'use strict';

const Joi         = require('joi');
const service     = require('./availability.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const conditionSchema = Joi.object({
  conditions: Joi.array().items(
    Joi.object({
      type:     Joi.string().valid('lesson_completed', 'quiz_score', 'date_range').required(),
      lessonId: Joi.when('type', {
        is: Joi.valid('lesson_completed', 'quiz_score'),
        then: Joi.string().uuid().required(),
        otherwise: Joi.forbidden(),
      }),
      minScore: Joi.when('type', {
        is: 'quiz_score',
        then: Joi.number().min(0).max(100).required(),
        otherwise: Joi.forbidden(),
      }),
      start: Joi.when('type', {
        is: 'date_range',
        then: Joi.date().iso(),
        otherwise: Joi.forbidden(),
      }),
      end: Joi.when('type', {
        is: 'date_range',
        then: Joi.date().iso(),
        otherwise: Joi.forbidden(),
      }),
    })
  ).optional(),
});

async function setAvailability(req, res, next) {
  try {
    const { error, value } = conditionSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    }

    const availability = await service.setAvailability(
      req.params.lessonId,
      req.params.courseId,
      value.conditions,
      req.user
    );
    ApiResponse.success(res, { availability }, 'Availability conditions saved');
  } catch (err) {
    next(err);
  }
}

async function getAvailability(req, res, next) {
  try {
    const availability = await service.getAvailability(req.params.lessonId);
    ApiResponse.success(res, { availability });
  } catch (err) {
    next(err);
  }
}

async function evaluateLesson(req, res, next) {
  try {
    const availability = await service.getAvailability(req.params.lessonId);
    if (!availability) {
      ApiResponse.success(res, { accessible: true, reasons: [] });
      return;
    }
    const result = await service.evaluateConditions(req.user.id, availability.conditions);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

async function evaluateCourse(req, res, next) {
  try {
    const results = await service.evaluateCourseAvailability(req.user.id, req.params.courseId);
    ApiResponse.success(res, { availability: results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setAvailability,
  getAvailability,
  evaluateLesson,
  evaluateCourse,
};
