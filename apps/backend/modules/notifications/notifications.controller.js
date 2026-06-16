'use strict';

const service     = require('./notifications.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');
const paginate    = require('../../shared/utils/pagenate');

async function getNotifications(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const unreadOnly = req.query.unreadOnly === 'true';
    const data = await service.getNotifications(req.user.id, {
      page: req.query.page, limit, unreadOnly,
    });
    ApiResponse.paginated(res, data.notifications, pagination(data.total), undefined);
    // Also attach unreadCount in response
  } catch (err) { next(err); }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await service.getUnreadCount(req.user.id);
    ApiResponse.success(res, { count });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const { ids } = req.body; // optional array of UUIDs
    await service.markRead(req.user.id, ids || []);
    ApiResponse.success(res, {}, ids?.length ? `${ids.length} notification(s) marked read` : 'All notifications marked read');
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    await service.deleteNotification(req.user.id, req.params.notificationId);
    ApiResponse.success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
}

async function getPreferences(req, res, next) {
  try {
    const prefs = await service.getPreferences(req.user.id);
    ApiResponse.success(res, { preferences: prefs });
  } catch (err) { next(err); }
}

async function updatePreference(req, res, next) {
  try {
    const { type } = req.params;
    const { inApp, email } = req.body;
    const pref = await service.updatePreference(req.user.id, type, { inApp, email });
    ApiResponse.success(res, { preference: pref }, 'Preference updated');
  } catch (err) { next(err); }
}

module.exports = {
  getNotifications, getUnreadCount, markRead,
  deleteNotification, getPreferences, updatePreference,
};