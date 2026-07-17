'use strict';

const ApiError = require('../utils/apiError');

/**
 * Role-based access control middleware.
 * Must be used AFTER authenticate middleware.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, authorize('admin'), controller.deleteUser);
 *   router.post('/courses',     authenticate, authorize('instructor', 'admin'), controller.create);
 */
module.exports = function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (req.user.role !== 'super_admin' && !allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(
        `Role '${req.user.role}' is not allowed to access this resource`
      ));
    }

    next();
  };
};
