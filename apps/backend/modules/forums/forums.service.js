'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const eventBus = require('../../shared/events/eventBus');

// ─────────────────────────────────────────────
//  FORUM THREADS
// ─────────────────────────────────────────────

async function listThreads(courseId, query, requestingUser) {
  const { page = 1, limit = 20, search, unpinned } = query;
  const offset = (page - 1) * limit;

  let where   = 'ft.deleted_at IS NULL AND ft.course_id = $1';
  let params  = [courseId];
  let paramIdx = 2;

  if (search) {
    where += ` AND (ft.title ILIKE $${paramIdx} OR ft.content ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  const countResult = await db.query(
    `SELECT COUNT(*) FROM forum_threads ft WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  let orderBy = 'ft.is_pinned DESC, ft.last_post_at DESC';
  if (unpinned === 'true') orderBy = 'ft.last_post_at DESC';

  const { rows } = await db.query(
    `SELECT ft.*, u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM forum_threads ft
     JOIN users u ON u.id = ft.author_id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { threads: rows, total, page, limit };
}

async function getThread(threadId, requestingUser) {
  const { rows } = await db.query(
    `SELECT ft.*, u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM forum_threads ft
     JOIN users u ON u.id = ft.author_id
     WHERE ft.id = $1 AND ft.deleted_at IS NULL`,
    [threadId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');

  const thread = rows[0];

  await db.query(
    'UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1',
    [threadId]
  );
  thread.view_count++;

  const { rows: posts } = await db.query(
    `SELECT fp.*, u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM forum_posts fp
     JOIN users u ON u.id = fp.author_id
     WHERE fp.thread_id = $1 AND fp.deleted_at IS NULL
     ORDER BY fp.created_at ASC`,
    [threadId]
  );

  thread.posts = posts;
  return thread;
}

async function createThread(courseId, data, requestingUser) {
  const { title, content } = data;
  const { rows } = await db.query(
    `INSERT INTO forum_threads (course_id, author_id, title, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [courseId, requestingUser.id, title, content]
  );

  const thread = rows[0];

  const { rows: enrollments } = await db.query(
    `SELECT user_id FROM enrollments
     WHERE course_id = $1 AND status = 'active' AND user_id != $2`,
    [courseId, requestingUser.id]
  );

  for (const e of enrollments) {
    eventBus.emit('notification', {
      userId: e.user_id,
      type: 'course_announcement',
      title: `New discussion: ${title}`,
      body: content.substring(0, 200),
      data: { threadId: thread.id, courseId },
    });
  }

  return thread;
}

async function updateThread(threadId, data, requestingUser) {
  const thread = await getThread(threadId, requestingUser);

  if (thread.author_id !== requestingUser.id && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own threads');
  }

  const allowed = {};
  if (data.title !== undefined) allowed.title = data.title;
  if (data.content !== undefined) allowed.content = data.content;

  if (Object.keys(allowed).length === 0) return thread;

  const sets = Object.keys(allowed).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = Object.values(allowed);

  const { rows } = await db.query(
    `UPDATE forum_threads SET ${sets} WHERE id = $1 RETURNING *`,
    [threadId, ...values]
  );
  return rows[0];
}

async function deleteThread(threadId, requestingUser) {
  const thread = await getThread(threadId, requestingUser);

  if (thread.author_id !== requestingUser.id && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own threads');
  }

  await db.query(
    'UPDATE forum_threads SET deleted_at = NOW() WHERE id = $1',
    [threadId]
  );
}

async function pinThread(threadId, pin, requestingUser) {
  const { rows } = await db.query(
    `SELECT ft.*, c.instructor_id FROM forum_threads ft
     JOIN courses c ON c.id = ft.course_id
     WHERE ft.id = $1 AND ft.deleted_at IS NULL`,
    [threadId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');
  if (requestingUser.role !== 'admin' && rows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Only instructors can pin threads');
  }

  const { rows: updated } = await db.query(
    'UPDATE forum_threads SET is_pinned = $1 WHERE id = $2 RETURNING *',
    [pin, threadId]
  );
  return updated[0];
}

async function lockThread(threadId, lock, requestingUser) {
  const { rows } = await db.query(
    `SELECT ft.*, c.instructor_id FROM forum_threads ft
     JOIN courses c ON c.id = ft.course_id
     WHERE ft.id = $1 AND ft.deleted_at IS NULL`,
    [threadId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');
  if (requestingUser.role !== 'admin' && rows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Only instructors can lock threads');
  }

  const { rows: updated } = await db.query(
    'UPDATE forum_threads SET is_locked = $1 WHERE id = $2 RETURNING *',
    [lock, threadId]
  );
  return updated[0];
}

// ─────────────────────────────────────────────
//  FORUM POSTS
// ─────────────────────────────────────────────

async function createPost(threadId, data, requestingUser) {
  const thread = await getThread(threadId, requestingUser);

  if (thread.is_locked && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('This thread is locked');
  }

  const { rows } = await db.query(
    `INSERT INTO forum_posts (thread_id, course_id, author_id, content, parent_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [threadId, thread.course_id, requestingUser.id, data.content, data.parentId || null]
  );

  const post = rows[0];

  if (thread.author_id !== requestingUser.id) {
    eventBus.emit('notification', {
      userId: thread.author_id,
      type: 'forum_reply',
      title: `Re: ${thread.title}`,
      body: data.content.substring(0, 200),
      data: { threadId, postId: post.id, courseId: thread.course_id },
    });
  }

  return post;
}

async function updatePost(postId, content, requestingUser) {
  const { rows } = await db.query(
    `SELECT fp.*, ft.author_id AS thread_author_id, ft.is_locked
     FROM forum_posts fp
     JOIN forum_threads ft ON ft.id = fp.thread_id
     WHERE fp.id = $1 AND fp.deleted_at IS NULL`,
    [postId]
  );
  if (!rows[0]) throw ApiError.notFound('Post not found');

  const post = rows[0];
  if (post.is_locked && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('This thread is locked');
  }
  if (post.author_id !== requestingUser.id && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own posts');
  }

  const { rows: updated } = await db.query(
    'UPDATE forum_posts SET content = $1, is_edited = true WHERE id = $2 RETURNING *',
    [content, postId]
  );
  return updated[0];
}

async function deletePost(postId, requestingUser) {
  const { rows } = await db.query(
    'SELECT * FROM forum_posts WHERE id = $1 AND deleted_at IS NULL',
    [postId]
  );
  if (!rows[0]) throw ApiError.notFound('Post not found');
  if (rows[0].author_id !== requestingUser.id && requestingUser.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own posts');
  }

  await db.query('UPDATE forum_posts SET deleted_at = NOW() WHERE id = $1', [postId]);
}

async function markAnswer(postId, requestingUser) {
  const { rows } = await db.query(
    `SELECT fp.*, ft.course_id FROM forum_posts fp
     JOIN forum_threads ft ON ft.id = fp.thread_id
     WHERE fp.id = $1 AND fp.deleted_at IS NULL`,
    [postId]
  );
  if (!rows[0]) throw ApiError.notFound('Post not found');

  const { rows: course } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1',
    [rows[0].course_id]
  );
  if (!course[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && course[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Only instructors can mark answers');
  }

  const { rows: updated } = await db.query(
    'UPDATE forum_posts SET is_answer = NOT is_answer WHERE id = $1 RETURNING *',
    [postId]
  );
  return updated[0];
}

async function toggleReaction(postId, emoji, requestingUser) {
  const { rows: existing } = await db.query(
    'SELECT id FROM forum_reactions WHERE post_id = $1 AND user_id = $2 AND emoji = $3',
    [postId, requestingUser.id, emoji]
  );

  if (existing[0]) {
    await db.query('DELETE FROM forum_reactions WHERE id = $1', [existing[0].id]);
    return { reacted: false, emoji };
  }

  await db.query(
    'INSERT INTO forum_reactions (post_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [postId, requestingUser.id, emoji]
  );
  return { reacted: true, emoji };
}

// ─────────────────────────────────────────────
//  REACTION COUNTS FOR A THREAD
// ─────────────────────────────────────────────

async function getReactionCounts(threadId) {
  const { rows } = await db.query(
    `SELECT fr.post_id, fr.emoji, COUNT(*) AS count
     FROM forum_reactions fr
     JOIN forum_posts fp ON fp.id = fr.post_id
     WHERE fp.thread_id = $1 AND fp.deleted_at IS NULL
     GROUP BY fr.post_id, fr.emoji`,
    [threadId]
  );
  return rows;
}

module.exports = {
  listThreads,
  getThread,
  createThread,
  updateThread,
  deleteThread,
  pinThread,
  lockThread,
  createPost,
  updatePost,
  deletePost,
  markAnswer,
  toggleReaction,
  getReactionCounts,
};
