'use strict';

const service    = require('./admin.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

async function analytics(req, res, next) {
  try {
    const data = await service.getPlatformAnalytics();
    ApiResponse.success(res, data);
  } catch (err) { next(err); }
}

async function auditLogs(req, res, next) {
  try {
    const { page = 1, limit = 50, action, entityType, actorId } = req.query;
    const result = await service.listAuditLogs({ page: +page, limit: +limit, action, entityType, actorId });
    ApiResponse.paginated(res, result.rows, {
      total: result.total, page: +page, limit: +limit,
      totalPages: Math.ceil(result.total / +limit),
      hasNext: (+page * +limit) < result.total,
      hasPrev: +page > 1,
    });
  } catch (err) { next(err); }
}

async function getSettings(req, res, next) {
  try {
    const settings = await service.getSettings();
    ApiResponse.success(res, { settings });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await service.updateSettings(req.body, req.user.id);
    ApiResponse.success(res, { settings });
  } catch (err) { next(err); }
}

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await service.uploadLogo(req.file, req.user);
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
}

async function bulkUserActions(req, res, next) {
  try {
    const { userIds, action, value } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw ApiError.badRequest('userIds must be a non-empty array');
    }
    const result = await service.bulkUserAction({ userIds, action, value, actorId: req.user.id });
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
}

module.exports = { analytics, auditLogs, getSettings, updateSettings, uploadLogo, bulkUserActions };
