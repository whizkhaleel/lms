'use strict';

const rateLimit = require('express-rate-limit');
const env       = require('../../config/env');

// General API rate limiter (applied to admin routes)
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many authentication attempts. Please wait 15 minutes.' },
});

module.exports = { apiLimiter, authLimiter };
