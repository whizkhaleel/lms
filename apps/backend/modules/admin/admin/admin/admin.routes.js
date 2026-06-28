'use strict';

const router       = require('express').Router();
const multer       = require('multer');
const path         = require('path');
const controller   = require('./admin.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const { apiLimiter } = require('../../shared/middleware/rateLimiter');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(apiLimiter, authenticate, authorize('admin', 'super_admin'));

router.get('/analytics',                  controller.analytics);
router.get('/audit-logs',                 controller.auditLogs);
router.get('/settings',                   controller.getSettings);
router.put('/settings',                   controller.updateSettings);
router.post('/settings/logo',             upload.single('logo'), controller.uploadLogo);
router.post('/users/bulk-actions',        controller.bulkUserActions);

module.exports = router;
