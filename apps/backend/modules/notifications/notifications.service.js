'use strict';

const db    = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

// ─────────────────────────────────────────────
//  NOTIFICATION SERVICE
//
//  The central hub. Every module calls notify()
//  to create a record AND push it via Socket.io.
//
//  Usage from any service:
//    const { notify } = require('../notifications/notifications.service');
//    await notify(io, {
//      userId:  'uuid',
//      type:    'forum_reply',
//      title:   'New reply in your thread',
//      body:    'Ibrahim replied: "Great question..."',
//      data:    { threadId, courseId },
//    });
// ─────────────────────────────────────────────

// ── Core notify function ──────────────────────
async function notify(io, { userId, type, title, body, data = {} }) {
  // 1. Check user's preference for this notification type
  const { rows: prefRows } = await db.query(
    `SELECT in_app FROM notification_prefs
     WHERE user_id = $1 AND type = $2`,
    [userId, type]
  );
  // Default = in_app ON (no row means use default)
  const inApp = prefRows[0]?.in_app ?? true;
  if (!inApp) return null;

  // 2. Persist to DB
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [userId, type, title, body || null, JSON.stringify(data)]
  );
  const notification = rows[0];

  // 3. Push to connected client via Socket.io
  if (io) {
    io.to(`user_${userId}`).emit('notification', {
      id:        notification.id,
      type:      notification.type,
      title:     notification.title,
      body:      notification.body,
      data:      notification.data,
      createdAt: notification.created_at,
    });
  }

  return notification;
}

// ── Bulk notify (e.g. announcements to all enrolled students) ──
async function notifyMany(io, userIds, payload) {
  const results = await Promise.allSettled(
    userIds.map(userId => notify(io, { ...payload, userId }))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) console.warn(`[Notifications] ${failed} notifications failed to send`);
  return results.length - failed;
}

// ── Get notifications for a user ──────────────
async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
  const offset = (page - 1) * limit;
  const where  = unreadOnly
    ? 'WHERE n.user_id = $1 AND n.is_read = false'
    : 'WHERE n.user_id = $1';

  const [countRes, rowsRes] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM notifications n ${where}`, [userId]),
    db.query(
      `SELECT id, type, title, body, data, is_read, read_at, created_at
       FROM notifications n
       ${where}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
  ]);

  const { rows: unreadRow } = await db.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );

  return {
    notifications: rowsRes.rows,
    total:         parseInt(countRes.rows[0].count, 10),
    unreadCount:   parseInt(unreadRow[0].count, 10),
    page:          parseInt(page, 10),
    limit:         parseInt(limit, 10),
  };
}

// ── Mark as read ──────────────────────────────
async function markRead(userId, notificationIds) {
  // If no IDs given → mark ALL as read
  if (!notificationIds || notificationIds.length === 0) {
    await db.query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return;
  }

  await db.query(
    `UPDATE notifications SET is_read = true, read_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND is_read = false`,
    [userId, notificationIds]
  );
}

// ── Get unread count (for badge) ──────────────
async function getUnreadCount(userId) {
  const { rows } = await db.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return parseInt(rows[0].count, 10);
}

// ── Delete a notification ─────────────────────
async function deleteNotification(userId, notificationId) {
  const { rows } = await db.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [notificationId, userId]
  );
  if (!rows[0]) throw ApiError.notFound('Notification not found');
}

// ── Notification preferences ──────────────────
async function getPreferences(userId) {
  const { rows } = await db.query(
    'SELECT type, in_app, email FROM notification_prefs WHERE user_id = $1',
    [userId]
  );
  return rows;
}

async function updatePreference(userId, type, { inApp, email }) {
  const { rows } = await db.query(
    `INSERT INTO notification_prefs (user_id, type, in_app, email)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, type) DO UPDATE SET
       in_app     = COALESCE($3, notification_prefs.in_app),
       email      = COALESCE($4, notification_prefs.email),
       updated_at = NOW()
     RETURNING *`,
    [userId, type, inApp ?? true, email ?? true]
  );
  return rows[0];
}

module.exports = {
  notify, notifyMany,
  getNotifications, markRead, getUnreadCount,
  deleteNotification, getPreferences, updatePreference,
};