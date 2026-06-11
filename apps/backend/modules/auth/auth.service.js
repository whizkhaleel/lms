'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db       = require('../../config/db');
const redis    = require('../../config/redis');
const env      = require('../../config/env');
const ApiError = require('../../shared/utils/apiError');
const eventBus = require('../../shared/events/eventBus');

// Token helpers

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Register

async function register({ firstName, lastName, email, password }) {
  // 1. Check if email already exists
  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()]
  );
  if (existing.rows.length > 0) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  // 3. Create user + verification token in a transaction
  const user = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, status)
       VALUES ($1, $2, $3, $4, 'student', 'pending_verification')
       RETURNING id, email, first_name, last_name, role, status, created_at`,
      [email.toLowerCase(), passwordHash, firstName, lastName]
    );
    const newUser = rows[0];

    // Generate verification token
    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [newUser.id, token, expiresAt]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
       VALUES ('user.registered', 'user', $1, $2)`,
      [newUser.id, JSON.stringify({ email, role: 'student' })]
    );

    return { ...newUser, verificationToken: token };
  });

  // 4. Emit event - email worker will send the verification email
  eventBus.emit('user.registered', {
    userId:            user.id,
    email:             user.email,
    firstName:         user.first_name,
    verificationToken: user.verificationToken,
  });

  return {
    id:        user.id,
    email:     user.email,
    firstName: user.first_name,
    lastName:  user.last_name,
    role:      user.role,
    status:    user.status,
  };
}

// Login

async function login({ email, password, userAgent, ipAddress }) {
  // 1. Find user
  const { rows } = await db.query(
    `SELECT id, email, password_hash, first_name, last_name,
            role, status, email_verified_at
     FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );

  const user = rows[0];

  // Use consistent error - don't reveal if email exists
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 2. Check account status
  if (user.status === 'suspended') {
    throw ApiError.forbidden('Your account has been suspended. Contact support.');
  }
  if (user.status === 'pending_verification') {
    throw ApiError.forbidden('Please verify your email before logging in.');
  }
  if (user.status === 'deactivated') {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  // 3. Check password
  if (!user.password_hash) {
    throw ApiError.unauthorized('This account uses social login. Use Google to sign in.');
  }
  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 4. Generate tokens
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken  = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken({ id: user.id });

  // 5. Store refresh token hash in DB
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d

  await db.transaction(async (client) => {
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, userAgent, ipAddress, expiresAt]
    );
    await client.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'user.login', 'user', $1, $2)`,
      [user.id, ipAddress]
    );
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
      role:      user.role,
    },
  };
}

// Refresh access token

async function refresh(incomingRefreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(incomingRefreshToken);

  const { rows } = await db.query(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
            u.email, u.role, u.status
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [tokenHash]
  );

  const stored = rows[0];
  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  if (stored.status !== 'active') {
    throw ApiError.forbidden('Account is not active');
  }

  // Rotate: revoke old, issue new
  const newAccessToken  = signAccessToken({ id: stored.user_id, email: stored.email, role: stored.role });
  const newRefreshToken = signRefreshToken({ id: stored.user_id });
  const newHash         = hashToken(newRefreshToken);
  const expiresAt       = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.transaction(async (client) => {
    // Revoke old token
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [stored.id]
    );
    // Issue new token
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [stored.user_id, newHash, expiresAt]
    );
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// Logout

async function logout(userId, accessToken, refreshToken) {
  // Blacklist access token in Redis until it naturally expires
  const decoded = jwt.decode(accessToken);
  if (decoded?.exp) {
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.setEx(`bl_${accessToken}`, ttl, '1');
    }
  }

  // Revoke refresh token if provided
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );
  }

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'user.logout', 'user', $1)`,
    [userId]
  );
}

// Verify Email

async function verifyEmail(token) {
  const { rows } = await db.query(
    `SELECT evt.id, evt.user_id, evt.expires_at, evt.used_at
     FROM email_verification_tokens evt
     WHERE evt.token = $1`,
    [token]
  );

  const record = rows[0];
  if (!record) throw ApiError.badRequest('Invalid verification token');
  if (record.used_at) throw ApiError.badRequest('Token has already been used');
  if (new Date(record.expires_at) < new Date()) throw ApiError.badRequest('Verification token has expired');

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE users SET status = 'active', email_verified_at = NOW() WHERE id = $1`,
      [record.user_id]
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
      [record.id]
    );
  });

  eventBus.emit('user.email_verified', { userId: record.user_id });
}

// Forgot Password

async function forgotPassword(email) {
  const { rows } = await db.query(
    'SELECT id, first_name FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()]
  );

  // Always respond the same way - don't reveal if email exists
  if (!rows[0]) return;

  const user      = rows[0];
  const token     = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await db.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  eventBus.emit('user.forgot_password', {
    userId:     user.id,
    email,
    firstName:  user.first_name,
    resetToken: token,
  });
}

// Reset Password

async function resetPassword(token, newPassword) {
  const { rows } = await db.query(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1',
    [token]
  );

  const record = rows[0];
  if (!record) throw ApiError.badRequest('Invalid reset token');
  if (record.used_at) throw ApiError.badRequest('This reset link has already been used');
  if (new Date(record.expires_at) < new Date()) throw ApiError.badRequest('Reset link has expired');

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);

  await db.transaction(async (client) => {
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, record.user_id]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [record.id]
    );
    // Revoke all refresh tokens (force re-login everywhere)
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [record.user_id]
    );
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
