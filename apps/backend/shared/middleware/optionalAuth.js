'use strict';

const jwt      = require('jsonwebtoken');
const env      = require('../../config/env');
const redis    = require('../../config/redis');

/**
 * Optional authentication middleware.
 * If a valid Bearer token is present, attaches req.user.
 * If no token or an invalid token, silently continues (req.user stays undefined).
 */
module.exports = async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];

    const isBlacklisted = await redis.get(`bl_${token}`);
    if (isBlacklisted) return next();

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    req.user  = decoded;
    req.token = token;
  } catch {
    // Ignore — token invalid or expired, continue as unauthenticated
  }
  next();
};
