'use strict';

const Joi         = require('joi');
const service     = require('./calendar.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const createSchema = Joi.object({
  title:       Joi.string().trim().min(1).max(500).required(),
  description: Joi.string().trim().max(5000).allow(''),
  eventType:   Joi.string().valid('manual', 'assignment_due', 'course_start', 'institutional').default('manual'),
  startDate:   Joi.date().iso().required(),
  endDate:     Joi.date().iso().allow(null),
  allDay:      Joi.boolean().default(false),
  courseId:    Joi.string().uuid().allow(null),
  referenceType: Joi.string().valid('assignment', 'course').allow(null),
  referenceId: Joi.string().uuid().allow(null),
});

const updateSchema = Joi.object({
  title:       Joi.string().trim().min(1).max(500),
  description: Joi.string().trim().max(5000).allow(''),
  eventType:   Joi.string().valid('manual', 'assignment_due', 'course_start', 'institutional'),
  startDate:   Joi.date().iso(),
  endDate:     Joi.date().iso().allow(null),
  allDay:      Joi.boolean(),
}).min(1);

async function listEvents(req, res, next) {
  try {
    const events = await service.listEvents(
      req.query.courseId || null,
      req.user.id,
      req.user.role,
      {
        startDate: req.query.startDate,
        endDate:   req.query.endDate,
        eventType: req.query.eventType,
      }
    );
    ApiResponse.success(res, { events });
  } catch (err) { next(err); }
}

async function createEvent(req, res, next) {
  try {
    const { error, value } = createSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const event = await service.createEvent(value, req.user.id);
    ApiResponse.created(res, { event }, 'Event created');
  } catch (err) { next(err); }
}

async function updateEvent(req, res, next) {
  try {
    const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const event = await service.updateEvent(req.params.id, value, req.user.id, req.user.role);
    ApiResponse.success(res, { event }, 'Event updated');
  } catch (err) { next(err); }
}

async function deleteEvent(req, res, next) {
  try {
    await service.deleteEvent(req.params.id, req.user.id, req.user.role);
    ApiResponse.success(res, {}, 'Event deleted');
  } catch (err) { next(err); }
}

module.exports = { listEvents, createEvent, updateEvent, deleteEvent };
