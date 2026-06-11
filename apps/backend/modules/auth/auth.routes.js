'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./auth.controller');
const authenticate = require('../../shared/middleware/authenticate');
const { authLimiter } = require('../../shared/middleware/rateLimiter');

// Public routes
router.post('/register',        authLimiter, controller.register);
router.post('/login',           authLimiter, controller.login);
router.post('/refresh',         authLimiter, controller.refresh);
router.get ('/verify-email',                 controller.verifyEmail);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password',  authLimiter, controller.resetPassword);

// Protected routes
router.post('/logout', authenticate, controller.logout);
router.get ('/me',     authenticate, controller.me);

module.exports = router;
