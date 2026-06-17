'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const { notify } = require('../notifications/notifications.service');

// ─────────────────────────────────────────────
//  DIRECT MESSAGE SERVICE
//
//  Design:
//    - One dm_conversations row per user-pair
//    - Canonical ordering: user_a_id < user_b_id (UUID string)
//    - All messages belong to the conversation
//    - Unread counts tracked per side (unread_a / unread_b)
//    - Real-time delivery via Socket.io room `dm_${conversationId}`
// ─────────────────────────────────────────────

// ── Enforce student ↔ instructor restriction ──
// Students may only message instructors of their enrolled courses.
// Instructors can message any of their students.
// Admins can message anyone.
async function verifyCanMessage(senderId, recipientId, senderRole) {
  if (senderRole === 'admin') return;

  // Prevent messaging yourself
  if (senderId === recipientId) {
    throw ApiError.badRequest('You cannot send a message to yourself');
  }

  const { rows: recipientRows } = await db.query(
    'SELECT role FROM users WHERE id=$1 AND deleted_at IS NULL',
    [recipientId]
  );
  if (!recipientRows[0]) throw ApiError.notFound('Recipient not found');
  const recipientRole = recipientRows[0].role;

  if (senderRole === 'student') {
    // Student → must be messaging an instructor of one of their courses
    const { rows } = await db.query(
      `SELECT c.id FROM courses c
       JOIN enrollments e ON e.course_id = c.id
       WHERE e.user_id = $1 AND c.instructor_id = $2
         AND e.status = 'active' AND c.deleted_at IS NULL`,
      [senderId, recipientId]
    );
    if (!rows[0]) {
      throw ApiError.forbidden(
        'Students can only message instructors of courses they are enrolled in'
      );
    }
  } else if (senderRole === 'instructor') {
    // Instructor → must be messaging a student enrolled in their course
    if (recipientRole !== 'student' && recipientRole !== 'admin') {
      throw ApiError.forbidden('Instructors can only message their enrolled students or admins');
    }
    if (recipientRole === 'student') {
      const { rows } = await db.query(
        `SELECT c.id FROM courses c
         JOIN enrollments e ON e.course_id = c.id
         WHERE c.instructor_id = $1 AND e.user_id = $2
           AND e.status = 'active' AND c.deleted_at IS NULL`,
        [senderId, recipientId]
      );
      if (!rows[0]) {
        throw ApiError.forbidden(
          'You can only message students enrolled in your courses'
        );
      }
    }
  }
}

// ── Get or create conversation between two users ──
async function getOrCreateConversation(userAId, userBId) {
  // Enforce canonical ordering — smaller UUID is always user_a
  const [a, b] = [userAId, userBId].sort();

  const { rows: existing } = await db.query(
    'SELECT * FROM dm_conversations WHERE user_a_id=$1 AND user_b_id=$2',
    [a, b]
  );
  if (existing[0]) return existing[0];

  const { rows } = await db.query(
    'INSERT INTO dm_conversations (user_a_id, user_b_id) VALUES ($1,$2) RETURNING *',
    [a, b]
  );
  return rows[0];
}

// ── Get all conversations for a user ──────────
async function getConversations(userId) {
  const { rows } = await db.query(
    `SELECT
       dc.id AS conversation_id,
       dc.last_message,
       dc.last_message_at,
       -- Unread count for this user
       CASE WHEN dc.user_a_id = $1 THEN dc.unread_a ELSE dc.unread_b END AS unread_count,
       -- The other participant
       CASE WHEN dc.user_a_id = $1 THEN u_b.id   ELSE u_a.id   END AS other_user_id,
       CASE WHEN dc.user_a_id = $1
            THEN u_b.first_name || ' ' || u_b.last_name
            ELSE u_a.first_name || ' ' || u_a.last_name
       END AS other_user_name,
       CASE WHEN dc.user_a_id = $1 THEN u_b.role ELSE u_a.role END AS other_user_role
     FROM dm_conversations dc
     JOIN users u_a ON u_a.id = dc.user_a_id
     JOIN users u_b ON u_b.id = dc.user_b_id
     WHERE dc.user_a_id = $1 OR dc.user_b_id = $1
     ORDER BY dc.last_message_at DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

// ── Get messages in a conversation (paginated) ──
async function getMessages(conversationId, userId, { page = 1, limit = 50 }) {
  // Verify user is part of this conversation
  const { rows: convRows } = await db.query(
    'SELECT * FROM dm_conversations WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)',
    [conversationId, userId]
  );
  if (!convRows[0]) throw ApiError.forbidden('Access denied');

  const offset = (page - 1) * limit;

  const [countRes, msgsRes] = await Promise.all([
    db.query(
      'SELECT COUNT(*) FROM dm_messages WHERE conversation_id=$1 AND deleted_at IS NULL',
      [conversationId]
    ),
    db.query(
      `SELECT
         dm.id, dm.content, dm.is_read, dm.read_at, dm.created_at,
         dm.sender_id,
         u.first_name || ' ' || u.last_name AS sender_name,
         u.role AS sender_role
       FROM dm_messages dm
       JOIN users u ON u.id = dm.sender_id
       WHERE dm.conversation_id=$1 AND dm.deleted_at IS NULL
       ORDER BY dm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    ),
  ]);

  // Mark all unread messages from the other person as read
  await db.transaction(async (client) => {
    await client.query(
      `UPDATE dm_messages SET is_read=true, read_at=NOW()
       WHERE conversation_id=$1 AND sender_id != $2 AND is_read=false`,
      [conversationId, userId]
    );
    // Reset unread count for this user's side
    const conv = convRows[0];
    const isA  = conv.user_a_id === userId;
    await client.query(
      `UPDATE dm_conversations SET ${isA ? 'unread_a' : 'unread_b'} = 0 WHERE id=$1`,
      [conversationId]
    );
  });

  return {
    messages: msgsRes.rows.reverse(), // return oldest-first
    total:    parseInt(countRes.rows[0].count, 10),
    page:     parseInt(page, 10),
    limit:    parseInt(limit, 10),
  };
}

// ── Send a message ────────────────────────────
async function sendMessage(senderId, senderRole, recipientId, content, io) {
  await verifyCanMessage(senderId, recipientId, senderRole);

  const conversation = await getOrCreateConversation(senderId, recipientId);
  const isA          = conversation.user_a_id === senderId;

  // Insert message
  const { rows } = await db.query(
    `INSERT INTO dm_messages (conversation_id, sender_id, content)
     VALUES ($1,$2,$3) RETURNING *`,
    [conversation.id, senderId, content]
  );
  const message = rows[0];

  // Get sender name for notification
  const { rows: senderRows } = await db.query(
    'SELECT first_name, last_name FROM users WHERE id=$1', [senderId]
  );
  const senderName = `${senderRows[0].first_name} ${senderRows[0].last_name}`;

  // Update conversation preview + increment recipient's unread count
  await db.query(
    `UPDATE dm_conversations SET
       last_message    = $1,
       last_message_at = NOW(),
       ${isA ? 'unread_b' : 'unread_a'} = ${isA ? 'unread_b' : 'unread_a'} + 1
     WHERE id = $2`,
    [content.slice(0, 200), conversation.id]
  );

  // Emit via Socket.io to the conversation room
  if (io) {
    io.to(`dm_${conversation.id}`).emit('new_message', {
      conversationId: conversation.id,
      message: {
        id:         message.id,
        content:    message.content,
        senderId:   message.sender_id,
        senderName,
        createdAt:  message.created_at,
        isRead:     false,
      },
    });

    // Also emit to recipient's personal room (for inbox badge update)
    io.to(`user_${recipientId}`).emit('dm_received', {
      conversationId: conversation.id,
      senderName,
      preview: content.slice(0, 80),
    });
  }

  // In-app notification for recipient
  await notify(io, {
    userId: recipientId,
    type:   'direct_message',
    title:  `New message from ${senderName}`,
    body:   content.slice(0, 100),
    data:   { conversationId: conversation.id, senderId },
  });

  return { message, conversationId: conversation.id };
}

// ── Delete a message (soft) ───────────────────
async function deleteMessage(messageId, userId) {
  const { rows } = await db.query(
    `UPDATE dm_messages SET deleted_at=NOW()
     WHERE id=$1 AND sender_id=$2 AND deleted_at IS NULL
     RETURNING id`,
    [messageId, userId]
  );
  if (!rows[0]) throw ApiError.notFound('Message not found or already deleted');
}

// ── Get total unread DM count ─────────────────
async function getUnreadCount(userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(
       CASE WHEN user_a_id=$1 THEN unread_a ELSE unread_b END
     ), 0) AS total
     FROM dm_conversations
     WHERE user_a_id=$1 OR user_b_id=$1`,
    [userId]
  );
  return parseInt(rows[0].total, 10);
}

module.exports = {
  getConversations, getMessages, sendMessage,
  deleteMessage, getUnreadCount, getOrCreateConversation,
};