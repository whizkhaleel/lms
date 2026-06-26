'use strict';

const Joi         = require('joi');
const service     = require('./courses.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

// ── Validation schemas ────────────────────────
const courseSchema = Joi.object({
  title:            Joi.string().trim().min(5).max(255).required(),
  description:      Joi.string().max(5000),
  shortDescription: Joi.string().max(500),
  categoryId:       Joi.string().uuid(),
  level:            Joi.string().valid('beginner', 'intermediate', 'advanced'),
  language:         Joi.string().max(50),
  tags:             Joi.array().items(Joi.string()).max(10),
  requirements:     Joi.array().items(Joi.string()).max(20),
  objectives:       Joi.array().items(Joi.string()).max(20),
  instructorId:     Joi.string().uuid().required(),
});

const sectionSchema = Joi.object({
  title:       Joi.string().trim().min(2).max(255).required(),
  description: Joi.string().max(1000),
});

// ── Public ────────────────────────────────────
async function listCourses(req, res, next) {
  try {
    const { page, limit, category, search, level, sort } = req.query;
    const result = await service.listCourses({ page, limit, category, search, level, sort });
    const { courses, total, ...rest } = result;
    ApiResponse.paginated(res, courses, {
      total, page: rest.page, limit: rest.limit,
      totalPages: Math.ceil(total / rest.limit),
      hasNext: (rest.page * rest.limit) < total,
      hasPrev: rest.page > 1,
    });
  } catch (err) { next(err); }
}

async function getCourse(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const course = await service.getCourse(req.params.slug, userId);
    ApiResponse.success(res, { course });
  } catch (err) { next(err); }
}

async function listCategories(req, res, next) {
  try {
    const categories = await service.listCategories();
    ApiResponse.success(res, { categories });
  } catch (err) { next(err); }
}

// ── Admin ─────────────────────────────────────
async function createCourse(req, res, next) {
  try {
    const { error, value } = courseSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const { instructorId, ...courseData } = value;
    const course = await service.createCourse({ ...courseData, instructorId });
    ApiResponse.created(res, { course }, 'Course created successfully');
  } catch (err) { next(err); }
}

async function updateCourse(req, res, next) {
  try {
    const { error, value } = courseSchema.fork(Object.keys(courseSchema.describe().keys), s => s.optional())
      .validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const course = await service.updateCourse(req.params.id, value, req.user);
    ApiResponse.success(res, { course }, 'Course updated');
  } catch (err) { next(err); }
}

async function publishCourse(req, res, next) {
  try {
    const course = await service.publishCourse(req.params.id, req.user);
    ApiResponse.success(res, { course }, 'Course published successfully');
  } catch (err) { next(err); }
}

async function unpublishCourse(req, res, next) {
  try {
    const course = await service.unpublishCourse(req.params.id, req.user);
    ApiResponse.success(res, { course }, 'Course moved back to draft');
  } catch (err) { next(err); }
}

async function deleteCourse(req, res, next) {
  try {
    await service.deleteCourse(req.params.id, req.user);
    ApiResponse.success(res, {}, 'Course deleted');
  } catch (err) { next(err); }
}

async function cloneCourse(req, res, next) {
  try {
    const course = await service.cloneCourse(req.params.id, req.user);
    ApiResponse.created(res, { course }, 'Course duplicated successfully');
  } catch (err) { next(err); }
}

async function uploadThumbnail(req, res, next) {
  try {
    if (!req.file) throw ApiError.badRequest('No file provided');
    const file = await service.uploadThumbnail(req.params.id, req.file, req.user.id, req.user);
    ApiResponse.success(res, { file }, 'Thumbnail uploaded successfully');
  } catch (err) { next(err); }
}

// ── Sections ──────────────────────────────────
async function createSection(req, res, next) {
  try {
    const { error, value } = sectionSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const section = await service.createSection(req.params.courseId, value, req.user);
    ApiResponse.created(res, { section }, 'Section created');
  } catch (err) { next(err); }
}

async function updateSection(req, res, next) {
  try {
    const section = await service.updateSection(
      req.params.courseId, req.params.sectionId, req.body, req.user
    );
    ApiResponse.success(res, { section }, 'Section updated');
  } catch (err) { next(err); }
}

async function deleteSection(req, res, next) {
  try {
    await service.deleteSection(req.params.courseId, req.params.sectionId, req.user);
    ApiResponse.success(res, {}, 'Section deleted');
  } catch (err) { next(err); }
}

async function reorderSections(req, res, next) {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) throw ApiError.badRequest('orderedIds must be an array');
    await service.reorderSections(req.params.courseId, orderedIds, req.user);
    ApiResponse.success(res, {}, 'Sections reordered');
  } catch (err) { next(err); }
}

async function getMyCourses(req, res, next) {
  try {
    const courses = req.user.role === 'admin'
      ? await service.getAllCoursesForAdmin({ status: req.query.status, search: req.query.search })
      : await service.getMyCourses(req.user.id);
    ApiResponse.success(res, courses);
  } catch (err) { next(err); }
}

module.exports = {
  listCourses, getCourse, listCategories, getMyCourses,
  createCourse, updateCourse, publishCourse, unpublishCourse,
  deleteCourse, cloneCourse, uploadThumbnail,
  createSection, updateSection, deleteSection, reorderSections,
};
