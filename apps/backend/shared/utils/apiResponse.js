'use strict';

/**
 * Standard API response format.
 * Every endpoint returns the same shape — makes frontend integration predictable.
 *
 * Success:  { success: true,  data: {...},  message: '...' }
 * Error:    { success: false, error: '...', errors: [...] }
 * Paginated:{ success: true,  data: [...],  pagination: {...} }
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Created') => {
  return success(res, data, message, 201);
};

const paginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

const error = (res, message = 'Error', statusCode = 500, errors = []) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

module.exports = { success, created, paginated, error };
