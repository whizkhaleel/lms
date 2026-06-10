'use strict';

const jwt      = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const env      = require('../../config/env');
const redis    = require('../../config/redis');

/**
 * Authenticate middleware — verifies JWT access token.
 * Attaches req.user = { id, email, role } on success.
 *
 * Also checks a Redis blacklist for logged-out tokens.
 */
module.exports = async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Check blacklist (token invalidated on logout)
    const isBlacklisted = await redis.get(`bl_${token}`);
    if (isBlacklisted) {
      throw ApiError.unauthorized('Token has been revoked');
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    req.user  = decoded;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
};
