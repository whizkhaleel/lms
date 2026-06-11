'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./users.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

// All user routes require authentication
router.use(authenticate);

// Own profile
router.get  ('/profile',  controller.getProfile);
router.patch('/profile',  controller.updateProfile);
router.patch('/password', controller.changePassword);

// Admin routes
router.get   ('/',           authorize('admin', 'super_admin'), controller.listUsers);
router.get   ('/:id',        authorize('admin', 'super_admin'), controller.getUser);
router.patch ('/:id/role',   authorize('admin', 'super_admin'), controller.updateRole);
router.patch ('/:id/status', authorize('admin', 'super_admin'), controller.updateStatus);
router.delete('/:id',        authorize('admin', 'super_admin'), controller.deleteUser);

module.exports = router;
