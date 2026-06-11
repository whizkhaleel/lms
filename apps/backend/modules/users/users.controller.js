'use strict';

const bcrypt      = require('bcryptjs');
const Joi         = require('joi');
const db          = require('../../config/db');
const env         = require('../../config/env');
const ApiError    = require('../../shared/utils/apiError');
const ApiResponse = require('../../shared/utils/apiResponse');
const paginate    = require('../../shared/utils/pagenate');

// Get own profile
async function getProfile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role, status,
              bio, headline, avatar_file_id, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Update own profile
async function updateProfile(req, res, next) {
  try {
    const schema = Joi.object({
      firstName: Joi.string().trim().min(2).max(100),
      lastName:  Joi.string().trim().min(2).max(100),
      bio:       Joi.string().max(1000).allow('', null),
      headline:  Joi.string().max(255).allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));

    const { rows } = await db.query(
      `UPDATE users
       SET first_name  = COALESCE($1, first_name),
           last_name   = COALESCE($2, last_name),
           bio         = COALESCE($3, bio),
           headline    = COALESCE($4, headline),
           updated_at  = NOW()
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, bio, headline, updated_at`,
      [value.firstName, value.lastName, value.bio, value.headline, req.user.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] }, 'Profile updated');
  } catch (err) {
    next(err);
  }
}

// Change own password
async function changePassword(req, res, next) {
  try {
    const schema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword:     Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));

    const { rows } = await db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.id]
    );
    if (!rows[0]?.password_hash) throw ApiError.badRequest('No password set on this account');

    const valid = await bcrypt.compare(value.currentPassword, rows[0].password_hash);
    if (!valid) throw ApiError.badRequest('Current password is incorrect');

    const hash = await bcrypt.hash(value.newPassword, env.BCRYPT_SALT_ROUNDS);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );
    ApiResponse.success(res, {}, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

// Admin: List users
async function listUsers(req, res, next) {
  try {
    const { limit, offset, pagination } = paginate(req.query);
    const { role, status, search } = req.query;

    const conditions = ['deleted_at IS NULL'];
    const params = [];
    let i = 1;

    if (role) {
      conditions.push(`role = $${i++}`);
      params.push(role);
    }
    if (status) {
      conditions.push(`status = $${i++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, usersResult] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users ${where}`, params),
      db.query(
        `SELECT id, email, first_name, last_name, role, status, created_at, last_login_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    ApiResponse.paginated(res, usersResult.rows, pagination(total));
  } catch (err) {
    next(err);
  }
}

// Admin: Get single user
async function getUser(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role, status,
              bio, headline, created_at, updated_at, last_login_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Admin: Update role
async function updateRole(req, res, next) {
  try {
    const { role } = req.body;
    const validRoles = ['student', 'instructor', 'admin'];
    if (!validRoles.includes(role)) {
      throw ApiError.badRequest(`Role must be one of: ${validRoles.join(', ')}`);
    }
    if (req.params.id === req.user.id) {
      throw ApiError.forbidden('You cannot change your own role');
    }
    const { rows } = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, email, role`,
      [role, req.params.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] }, 'Role updated');
  } catch (err) {
    next(err);
  }
}

// Admin: Update status
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'deactivated'];
    if (!validStatuses.includes(status)) {
      throw ApiError.badRequest(`Status must be one of: ${validStatuses.join(', ')}`);
    }
    if (req.params.id === req.user.id) {
      throw ApiError.forbidden('You cannot change your own status');
    }
    const { rows } = await db.query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, email, status`,
      [status, req.params.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] }, 'Status updated');
  } catch (err) {
    next(err);
  }
}

// Admin: Soft delete user
async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user.id) {
      throw ApiError.forbidden('You cannot delete your own account');
    }
    const { rows } = await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, {}, 'User deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  listUsers,
  getUser,
  updateRole,
  updateStatus,
  deleteUser,
};
