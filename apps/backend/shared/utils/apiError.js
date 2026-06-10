'use strict';

/**
 * Custom API Error class.
 * Thrown from services/controllers → caught by errorHandler middleware.
 *
 * Usage:
 *   throw new ApiError(404, 'Course not found');
 *   throw new ApiError(400, 'Validation failed', errors);
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name       = 'ApiError';
    this.statusCode = statusCode;
    this.errors     = errors;   // array of field-level errors (for validation)
    this.isOperational = true;  // vs programmer errors (bugs)

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors)  { return new ApiError(400, message, errors); }
  static unauthorized(message)        { return new ApiError(401, message || 'Unauthorized'); }
  static forbidden(message)           { return new ApiError(403, message || 'Forbidden'); }
  static notFound(message)            { return new ApiError(404, message || 'Not found'); }
  static conflict(message)            { return new ApiError(409, message || 'Conflict'); }
  static internal(message)            { return new ApiError(500, message || 'Internal server error'); }
}

module.exports = ApiError;
