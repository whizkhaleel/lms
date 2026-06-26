'use strict';

const Joi         = require('joi');
const service     = require('./course-groups.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const groupSchema = Joi.object({
  name:        Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().allow('', null).max(2000),
  maxMembers:  Joi.number().integer().min(1).allow(null),
});

const updateGroupSchema = Joi.object({
  name:        Joi.string().trim().min(1).max(255),
  description: Joi.string().allow('', null).max(2000),
  maxMembers:  Joi.number().integer().min(1).allow(null),
}).min(1);

const memberSchema = Joi.object({
  userId: Joi.string().uuid().required(),
});

// ── Groups ────────────────────────────────────

async function listGroups(req, res, next) {
  try {
    const groups = await service.listGroups(req.params.courseId);
    ApiResponse.success(res, { groups });
  } catch (err) { next(err); }
}

async function getGroup(req, res, next) {
  try {
    const group = await service.getGroup(req.params.groupId);
    ApiResponse.success(res, { group });
  } catch (err) { next(err); }
}

async function createGroup(req, res, next) {
  try {
    const { error, value } = groupSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const group = await service.createGroup(req.params.courseId, value, req.user);
    ApiResponse.created(res, { group }, 'Group created');
  } catch (err) { next(err); }
}

async function updateGroup(req, res, next) {
  try {
    const { error, value } = updateGroupSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const group = await service.updateGroup(req.params.courseId, req.params.groupId, value, req.user);
    ApiResponse.success(res, { group }, 'Group updated');
  } catch (err) { next(err); }
}

async function removeGroup(req, res, next) {
  try {
    await service.deleteGroup(req.params.courseId, req.params.groupId, req.user);
    ApiResponse.success(res, null, 'Group deleted');
  } catch (err) { next(err); }
}

// ── Members ───────────────────────────────────

async function listMembers(req, res, next) {
  try {
    const members = await service.listMembers(req.params.groupId);
    ApiResponse.success(res, { members });
  } catch (err) { next(err); }
}

async function addMember(req, res, next) {
  try {
    const { error, value } = memberSchema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const member = await service.addMember(req.params.courseId, req.params.groupId, value.userId, req.user);
    ApiResponse.created(res, { member }, 'Member added');
  } catch (err) { next(err); }
}

async function removeMember(req, res, next) {
  try {
    await service.removeMember(req.params.courseId, req.params.groupId, req.params.userId, req.user);
    ApiResponse.success(res, null, 'Member removed');
  } catch (err) { next(err); }
}

// ── Enrolled students ─────────────────────────

async function listEnrolledStudents(req, res, next) {
  try {
    const students = await service.listEnrolledStudents(req.params.courseId);
    ApiResponse.success(res, { students });
  } catch (err) { next(err); }
}

module.exports = {
  listGroups, getGroup, createGroup, updateGroup, removeGroup,
  listMembers, addMember, removeMember,
  listEnrolledStudents,
};
