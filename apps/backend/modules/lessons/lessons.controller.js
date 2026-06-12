'use strict';

const Joi         = require('joi');
const service     = require('./lessons.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const lessonSchema = Joi.object({
  title:           Joi.string().trim().min(2).max(255).required(),
  type:            Joi.string().valid('video', 'pdf', 'text', 'quiz', 'assignment'),
  content:         Joi.string().max(50000),
  sectionId:       Joi.string().uuid().required(),
  durationSeconds: Joi.number().integer().min(0),
  isFreePreview:   Joi.boolean(),
  isPublished:     Joi.boolean(),
});

const updateLessonSchema = lessonSchema.fork(
  Object.keys(lessonSchema.describe().keys),
  (schema) => schema.optional()
).min(1);

async function createLesson(req, res, next) {
  try {
    const { error, value } = lessonSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map((detail) => detail.message));
    }

    const lesson = await service.createLesson(req.params.courseId, value.sectionId, value, req.user);
    ApiResponse.created(res, { lesson }, 'Lesson created');
  } catch (err) {
    next(err);
  }
}

async function getLesson(req, res, next) {
  try {
    const lesson = await service.getLesson(req.params.lessonId, req.params.courseId, req.user);
    ApiResponse.success(res, { lesson });
  } catch (err) {
    next(err);
  }
}

async function getPreview(req, res, next) {
  try {
    const lesson = await service.getPreview(req.params.lessonId, req.params.courseId);
    ApiResponse.success(res, { lesson });
  } catch (err) {
    next(err);
  }
}

async function updateLesson(req, res, next) {
  try {
    const { error, value } = updateLessonSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map((detail) => detail.message));
    }

    const lesson = await service.updateLesson(req.params.lessonId, req.params.courseId, value, req.user);
    ApiResponse.success(res, { lesson }, 'Lesson updated');
  } catch (err) {
    next(err);
  }
}

async function deleteLesson(req, res, next) {
  try {
    await service.deleteLesson(req.params.lessonId, req.params.courseId, req.user);
    ApiResponse.success(res, {}, 'Lesson deleted');
  } catch (err) {
    next(err);
  }
}

async function reorderLessons(req, res, next) {
  try {
    const { sectionId, orderedIds } = req.body;
    if (!sectionId) {
      throw ApiError.badRequest('sectionId is required');
    }
    if (!Array.isArray(orderedIds)) {
      throw ApiError.badRequest('orderedIds must be an array');
    }

    await service.reorderLessons(req.params.courseId, sectionId, orderedIds, req.user);
    ApiResponse.success(res, {}, 'Lessons reordered');
  } catch (err) {
    next(err);
  }
}

async function uploadVideo(req, res, next) {
  try {
    if (!req.file) {
      throw ApiError.badRequest('No video file provided');
    }

    const file = await service.uploadVideo(
      req.params.lessonId,
      req.params.courseId,
      req.file,
      req.user.id,
      req.user
    );
    ApiResponse.success(res, { file }, 'Video uploaded successfully');
  } catch (err) {
    next(err);
  }
}

async function uploadResource(req, res, next) {
  try {
    if (!req.file) {
      throw ApiError.badRequest('No file provided');
    }

    const resource = await service.uploadResource(
      req.params.lessonId,
      req.params.courseId,
      req.file,
      req.user.id,
      req.body.title,
      req.user
    );
    ApiResponse.success(res, { resource }, 'Resource uploaded');
  } catch (err) {
    next(err);
  }
}

async function deleteResource(req, res, next) {
  try {
    await service.deleteResource(
      req.params.lessonId,
      req.params.courseId,
      req.params.resourceId,
      req.user
    );
    ApiResponse.success(res, {}, 'Resource deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createLesson,
  getLesson,
  getPreview,
  updateLesson,
  deleteLesson,
  reorderLessons,
  uploadVideo,
  uploadResource,
  deleteResource,
};
