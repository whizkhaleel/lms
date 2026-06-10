'use strict';

const ApiError = require('../utils/apiError');
const env      = require('../../config/env');

/**
 * Global error handling middleware.
 * Must be registered LAST in Express (after all routes).
 *
 * Handles:
 *  - ApiError (operational — expected errors)
 *  - Joi validation errors
 *  - JWT errors
 *  - Unknown errors (programmer bugs)
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  console.error(`[Error] ${err.name}: ${err.message}`, {
    path:   req.path,
    method: req.method,
    stack:  env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Our own operational errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success:  false,
      message:  err.message,
      errors:   err.errors,
    });
  }

  // Joi validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success:  false,
      message:  'Validation failed',
      errors:   err.details?.map((d) => d.message) || [err.message],
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Resource already exists' });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Related resource not found' });
  }

  // Unknown / programmer errors
  const statusCode = err.statusCode || 500;
  const message    = env.NODE_ENV === 'production'
    ? 'Something went wrong'
    : err.message;

  return res.status(statusCode).json({
    success:  false,
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
