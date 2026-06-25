'use strict';

const router       = require('express').Router();
const controller   = require('./admin.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const { apiLimiter } = require('../../shared/middleware/rateLimiter');

router.use(apiLimiter, authenticate, authorize('admin', 'super_admin'));

router.get('/analytics',                  controller.analytics);
router.get('/audit-logs',                 controller.auditLogs);
router.get('/settings',                   controller.getSettings);
router.put('/settings',                   controller.updateSettings);
router.post('/users/bulk-actions',        controller.bulkUserActions);

module.exports = router;
