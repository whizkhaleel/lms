'use strict';

const Joi         = require('joi');
const service     = require('./announcements.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const createSchema = Joi.object({
  title: Joi.string().trim().min(1).max(255).required(),
  body:  Joi.string().trim().max(10000).allow('').default(''),
});

const updateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(255),
  body:  Joi.string().trim().max(10000).allow(''),
}).min(1);

async function list(req, res, next) {
  try {
    const result = await service.listAnnouncements(req.params.courseId, req.query);
    ApiResponse.paginated(res, result.announcements, result.pagination);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const io = req.app.get('io');
    const ann = await service.createAnnouncement(req.params.courseId, value, io, req.user);
    ApiResponse.created(res, { announcement: ann }, 'Announcement posted');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const ann = await service.updateAnnouncement(req.params.courseId, req.params.id, value, req.user);
    ApiResponse.success(res, { announcement: ann }, 'Announcement updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await service.deleteAnnouncement(req.params.courseId, req.params.id, req.user);
    ApiResponse.success(res, null, 'Announcement deleted');
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
