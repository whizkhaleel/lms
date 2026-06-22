'use strict';

const Joi         = require('joi');
const service     = require('./auth.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

// ── Validation schemas ────────────────────────

const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).required(),
  lastName:  Joi.string().trim().min(2).max(100).required(),
  email:     Joi.string().email({ tlds: { allow: false } }).lowercase().required(),
  password:  Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, and a number',
    }),
});

const loginSchema = Joi.object({
  email:    Joi.string().email({ tlds: { allow: false } }).lowercase().required(),
  password: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
  token:    Joi.string().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required(),
});

// ── Controllers ───────────────────────────────

async function register(req, res, next) {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));
    }

    const user = await service.register(value);
    ApiResponse.created(res, { user }, 'Account created. Please check your email to verify your account.');
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));
    }

    const result = await service.login({
      ...value,
      userAgent:  req.headers['user-agent'],
      ipAddress:  req.ip,
    });

    ApiResponse.success(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw ApiError.badRequest('Refresh token is required');

    const tokens = await service.refresh(refreshToken);
    ApiResponse.success(res, tokens, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await service.logout(req.user.id, req.token, refreshToken);
    ApiResponse.success(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const { rows } = await require('../../config/db').query(
      `SELECT id, email, first_name, last_name, role, status,
              bio, headline, avatar_file_id, must_change_password, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');

    ApiResponse.success(res, { user: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) throw ApiError.badRequest('Verification token is required');

    await service.verifyEmail(token);
    ApiResponse.success(res, {}, 'Email verified successfully. You can now log in.');
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) throw ApiError.badRequest('Email is required');

    await service.forgotPassword(email);
    // Always return same message — don't reveal if email exists
    ApiResponse.success(res, {}, 'If that email exists, a reset link has been sent.');
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));
    }

    await service.resetPassword(value.token, value.password);
    ApiResponse.success(res, {}, 'Password reset successfully. Please log in.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  verifyEmail,
  forgotPassword,
  resetPassword,
};