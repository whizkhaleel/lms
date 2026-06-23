'use strict';

const bcrypt      = require('bcryptjs');
const Joi         = require('joi');
const db          = require('../../config/db');
const env         = require('../../config/env');
const ApiError    = require('../../shared/utils/apiError');
const ApiResponse = require('../../shared/utils/apiResponse');
const paginate    = require('../../shared/utils/pagenate');
const { sendMail }      = require('../../shared/mailer/mailer');
const { generateTempPassword } = require('../../shared/utils/generatePasswords');
const { welcomeCredentialsEmail } = require('../../shared/mailer/templates');

// ── Admin: Create user (student or instructor) ───
const createUserSchema = Joi.object({
  email:     Joi.string().email({ tlds: { allow: false } }).lowercase().required(),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName:  Joi.string().trim().min(1).max(100).required(),
  role:      Joi.string().valid('student', 'instructor').required(),
  password:  Joi.string().min(6).max(128).optional(),
});

async function createUser(req, res, next) {
  try {
    const { error, value } = createUserSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map((d) => d.message));

    const { email, firstName, lastName, role, password } = value;

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    if (existing.rows[0]) throw ApiError.conflict('A user with this email already exists');

    const tempPassword = password || generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, env.BCRYPT_SALT_ROUNDS);

    const rows = await db.transaction(async (client) => {
      const { rows: newRows } = await client.query(
        `INSERT INTO users
           (email, password_hash, first_name, last_name, role, status,
            email_verified_at, must_change_password)
         VALUES ($1,$2,$3,$4,$5,'active',NOW(),true)
         RETURNING id, email, first_name, last_name, role, status`,
        [email, passwordHash, firstName, lastName, role]
      );

      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
         VALUES ($1, 'user.admin_created', 'user', $2, $3)`,
        [req.user.id, newRows[0].id, JSON.stringify({ email, role })]
      );

      return newRows;
    });

    const user = rows[0];

    try {
      await sendMail({
        to:      email,
        subject: role === 'instructor'
          ? 'Your instructor account has been created'
          : 'Your student account has been created',
        html:    welcomeCredentialsEmail({
          firstName,
          email,
          tempPassword,
          courseTitle: role === 'instructor' ? 'the LMS platform' : 'your courses',
        }),
      });
    } catch (mailErr) {
      console.error('[Users] Failed to send credentials email:', mailErr.message);
    }

    ApiResponse.created(res, { user, tempPassword }, `Account created. Credentials emailed to ${email}.`);
  } catch (err) {
    next(err);
  }
}

// ── Get own profile ────────────────────────────
async function getProfile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role, status,
              bio, headline, avatar_file_id, must_change_password,
              created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, { user: rows[0] });
  } catch (err) { next(err); }
}

// ── Update own profile ─────────────────────────
async function updateProfile(req, res, next) {
  try {
    const schema = Joi.object({
      firstName: Joi.string().trim().min(2).max(100),
      lastName:  Joi.string().trim().min(2).max(100),
      bio:       Joi.string().max(1000).allow('', null),
      headline:  Joi.string().max(255).allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

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
  } catch (err) { next(err); }
}

// ── Change own password ────────────────────────
async function changePassword(req, res, next) {
  try {
    const schema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword:     Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const { rows } = await db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.id]
    );
    if (!rows[0]?.password_hash) throw ApiError.badRequest('No password set on this account');

    const valid = await bcrypt.compare(value.currentPassword, rows[0].password_hash);
    if (!valid) throw ApiError.badRequest('Current password is incorrect');

    const hash = await bcrypt.hash(value.newPassword, env.BCRYPT_SALT_ROUNDS);
    await db.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );
    ApiResponse.success(res, {}, 'Password changed successfully');
  } catch (err) { next(err); }
}

// ── Admin: List users ──────────────────────────
async function listUsers(req, res, next) {
  try {
    const { limit, offset, pagination } = paginate(req.query);
    const { role, status, search }      = req.query;

    let conditions = ['deleted_at IS NULL'];
    let params     = [];
    let i          = 1;

    if (role)   { conditions.push(`role = $${i++}`);   params.push(role); }
    if (status) { conditions.push(`status = $${i++}`); params.push(status); }
    if (search) {
      conditions.push(`(email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

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
  } catch (err) { next(err); }
}

// ── Admin: Get single user ─────────────────────
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
  } catch (err) { next(err); }
}

// ── Admin: Update role ─────────────────────────
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
  } catch (err) { next(err); }
}

// ── Admin: Update status ───────────────────────
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
  } catch (err) { next(err); }
}

// ── Admin: Soft delete user ────────────────────
async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user.id) {
      throw ApiError.forbidden('You cannot delete your own account');
    }
    const { rows } = await db.query(
      `UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    );
    if (!rows[0]) throw ApiError.notFound('User not found');
    ApiResponse.success(res, {}, 'User deleted');
  } catch (err) { next(err); }
}

module.exports = {
  createUser, getProfile, updateProfile, changePassword,
  listUsers, getUser, updateRole, updateStatus, deleteUser,
};