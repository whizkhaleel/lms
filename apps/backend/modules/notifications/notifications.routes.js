'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./notifications.controller');
const authenticate = require('../../shared/middleware/authenticate');

router.use(authenticate);

router.get   ('/',                          controller.getNotifications);
router.get   ('/unread-count',              controller.getUnreadCount);
router.patch ('/read',                      controller.markRead);        // body: { ids: [] } or empty = all
router.delete('/:notificationId',           controller.deleteNotification);
router.get   ('/preferences',               controller.getPreferences);
router.patch ('/preferences/:type',         controller.updatePreference);

module.exports = router;