'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const { notify } = require('../notifications/notifications.service');

// ── Verify user is enrolled or owns the course ─
async function verifyCourseAccess(userId, courseId, role) {
  if (role === 'admin') return;
  const [enrolled, isInstructor] = await Promise.all([
    db.query(
      `SELECT e.id FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id=$1 AND e.course_id=$2 AND e.status='active' AND c.deleted_at IS NULL`,
      [userId, courseId]
    ),
    db.query(
      `SELECT id FROM courses WHERE id=$1 AND instructor_id=$2 AND deleted_at IS NULL`,
      [courseId, userId]
    ),
  ]);
  if (!enrolled.rows[0] && !isInstructor.rows[0]) {
    throw ApiError.forbidden('You must be enrolled in this course to access the forum');
  }
}

// ── @mention parser ───────────────────────────
function parseMentions(content) {
  const mentions = [];
  const regex    = /@(\w+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

// ─────────────────────────────────────────────
//  THREADS
// ─────────────────────────────────────────────

async function listThreads(courseId, userId, role, { page = 1, limit = 20, sort = 'latest', search }) {
  await verifyCourseAccess(userId, courseId, role);

  const offset     = (page - 1) * limit;
  const conditions = ['ft.course_id = $1', 'ft.deleted_at IS NULL'];
  const params     = [courseId];
  let   i          = 2;

  if (search) {
    conditions.push(`(ft.title ILIKE $${i} OR ft.content ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where   = 'WHERE ' + conditions.join(' AND ');
  const orderBy = sort === 'popular' ? 'ft.reply_count DESC, ft.last_post_at DESC'
                : sort === 'unanswered' ? 'ft.is_answered ASC, ft.last_post_at DESC'
                : 'ft.is_pinned DESC, ft.last_post_at DESC';

  const [countRes, rowsRes] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM forum_threads ft ${where}`, params),
    db.query(
      `SELECT
         ft.id, ft.title, ft.content, ft.is_pinned, ft.is_locked,
         ft.is_answered, ft.reply_count, ft.view_count, ft.last_post_at,
         ft.created_at,
         u.id AS author_id,
         u.first_name || ' ' || u.last_name AS author_name,
         u.role AS author_role
       FROM forum_threads ft
       JOIN users u ON u.id = ft.author_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    threads: rowsRes.rows,
    total:   parseInt(countRes.rows[0].count, 10),
    page:    parseInt(page, 10),
    limit:   parseInt(limit, 10),
  };
}

async function getThread(threadId, courseId, userId, role) {
  await verifyCourseAccess(userId, courseId, role);

  const { rows } = await db.query(
    `SELECT ft.*,
            u.id AS author_id,
            u.first_name || ' ' || u.last_name AS author_name,
            u.role AS author_role
     FROM forum_threads ft
     JOIN users u ON u.id = ft.author_id
     WHERE ft.id = $1 AND ft.course_id = $2 AND ft.deleted_at IS NULL`,
    [threadId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');

  // Increment view count (fire-and-forget)
  db.query('UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1', [threadId])
    .catch(() => {});

  return rows[0];
}

async function createThread(courseId, userId, role, { title, content }) {
  await verifyCourseAccess(userId, courseId, role);

  const { rows } = await db.query(
    `INSERT INTO forum_threads (course_id, author_id, title, content)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [courseId, userId, title, content]
  );

  // Notify instructor of new thread (unless the author IS the instructor)
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1', [courseId]
  );
  if (courseRows[0]?.instructor_id !== userId) {
    // We'll pass io from the controller
    rows[0]._notifyInstructorId = courseRows[0]?.instructor_id;
  }

  return rows[0];
}

async function updateThread(threadId, userId, role, courseId, updates) {
  const { rows } = await db.query(
    'SELECT author_id, course_id FROM forum_threads WHERE id = $1 AND deleted_at IS NULL',
    [threadId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');
  await verifyCourseAccess(userId, rows[0].course_id, role);
  if (role !== 'admin' && role !== 'instructor' && rows[0].author_id !== userId) {
    throw ApiError.forbidden('You can only edit your own threads');
  }

  const { rows: updated } = await db.query(
    `UPDATE forum_threads SET
       title     = COALESCE($1, title),
       content   = COALESCE($2, content),
       is_pinned = COALESCE($3, is_pinned),
       is_locked = COALESCE($4, is_locked),
       is_answered = COALESCE($5, is_answered),
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [updates.title, updates.content, updates.isPinned,
     updates.isLocked, updates.isAnswered, threadId]
  );
  return updated[0];
}

async function deleteThread(threadId, userId, role) {
  const { rows } = await db.query(
    'SELECT author_id, course_id FROM forum_threads WHERE id = $1 AND deleted_at IS NULL',
    [threadId]
  );
  if (!rows[0]) throw ApiError.notFound('Thread not found');
  await verifyCourseAccess(userId, rows[0].course_id, role);
  if (role !== 'admin' && role !== 'instructor' && rows[0].author_id !== userId) {
    throw ApiError.forbidden('You can only delete your own threads');
  }
  await db.query('UPDATE forum_threads SET deleted_at = NOW() WHERE id = $1', [threadId]);
}

// ─────────────────────────────────────────────
//  POSTS (replies)
// ─────────────────────────────────────────────

async function listPosts(threadId, courseId, userId, role, { page = 1, limit = 30 }) {
  await verifyCourseAccess(userId, courseId, role);

  const { rows: threadRows } = await db.query(
    'SELECT id FROM forum_threads WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL',
    [threadId, courseId]
  );
  if (!threadRows[0]) throw ApiError.notFound('Thread not found');

  const offset = (page - 1) * limit;
  const [countRes, postsRes] = await Promise.all([
    db.query(
      'SELECT COUNT(*) FROM forum_posts WHERE thread_id=$1 AND deleted_at IS NULL',
      [threadId]
    ),
    db.query(
      `SELECT
         fp.id, fp.content, fp.parent_id, fp.is_answer, fp.is_edited,
         fp.created_at, fp.updated_at,
         u.id AS author_id,
         u.first_name || ' ' || u.last_name AS author_name,
         u.role AS author_role,
         -- Reaction summary as JSON
         COALESCE(
           json_object_agg(fr.emoji, fr.count) FILTER (WHERE fr.emoji IS NOT NULL),
           '{}'
         ) AS reactions,
         -- Did the current user react?
         COALESCE(
           json_agg(fr.emoji) FILTER (WHERE fr.user_id = $2 AND fr.emoji IS NOT NULL),
           '[]'
         ) AS my_reactions
       FROM forum_posts fp
       JOIN users u ON u.id = fp.author_id
       LEFT JOIN (
         SELECT post_id, emoji, COUNT(*) AS count, unnest(array_agg(user_id)) AS user_id
         FROM forum_reactions
         GROUP BY post_id, emoji
       ) fr ON fr.post_id = fp.id
       WHERE fp.thread_id = $1 AND fp.deleted_at IS NULL AND fp.parent_id IS NULL
       GROUP BY fp.id, u.id
       ORDER BY fp.is_answer DESC, fp.created_at ASC
       LIMIT $3 OFFSET $4`,
      [threadId, userId, limit, offset]
    ),
  ]);

  return {
    posts: postsRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page:  parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

async function createPost(threadId, courseId, userId, role, { content, parentId }, io) {
  await verifyCourseAccess(userId, courseId, role);

  const { rows: threadRows } = await db.query(
    'SELECT id, author_id, title, is_locked FROM forum_threads WHERE id=$1 AND course_id=$2 AND deleted_at IS NULL',
    [threadId, courseId]
  );
  const thread = threadRows[0];
  if (!thread) throw ApiError.notFound('Thread not found');
  if (thread.is_locked && role !== 'admin' && role !== 'instructor') {
    throw ApiError.forbidden('This thread is locked and not accepting new replies');
  }

  const { rows } = await db.query(
    `INSERT INTO forum_posts (thread_id, course_id, author_id, content, parent_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [threadId, courseId, userId, content, parentId || null]
  );
  const post = rows[0];

  // Get author name for notification
  const { rows: authorRows } = await db.query(
    'SELECT first_name, last_name FROM users WHERE id = $1', [userId]
  );
  const authorName = `${authorRows[0].first_name} ${authorRows[0].last_name}`;

  // Notify thread author (if different from poster)
  if (thread.author_id !== userId) {
    await notify(io, {
      userId: thread.author_id,
      type:   'forum_reply',
      title:  'New reply to your thread',
      body:   `${authorName} replied: "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`,
      data:   { threadId, courseId, postId: post.id },
    });
  }

  // Handle @mentions
  const mentions = parseMentions(content);
  if (mentions.length > 0) {
    const { rows: mentionedUsers } = await db.query(
      `SELECT id FROM users WHERE LOWER(first_name) = ANY($1::text[]) AND id != $2`,
      [mentions.map(m => m.toLowerCase()), userId]
    );
    for (const mu of mentionedUsers) {
      await notify(io, {
        userId: mu.id,
        type:   'forum_mention',
        title:  `${authorName} mentioned you`,
        body:   content.slice(0, 120),
        data:   { threadId, courseId, postId: post.id },
      });
    }
  }

  return post;
}

async function updatePost(postId, userId, role, { content }) {
  const { rows } = await db.query(
    `SELECT fp.author_id, ft.course_id FROM forum_posts fp
     JOIN forum_threads ft ON ft.id = fp.thread_id
     WHERE fp.id=$1 AND fp.deleted_at IS NULL`,
    [postId]
  );
  if (!rows[0]) throw ApiError.notFound('Post not found');
  await verifyCourseAccess(userId, rows[0].course_id, role);
  if (role !== 'admin' && role !== 'instructor' && rows[0].author_id !== userId) {
    throw ApiError.forbidden('You can only edit your own posts');
  }
  const { rows: updated } = await db.query(
    `UPDATE forum_posts SET content=$1, is_edited=true, updated_at=NOW()
     WHERE id=$2 RETURNING *`,
    [content, postId]
  );
  return updated[0];
}

async function deletePost(postId, userId, role) {
  const { rows } = await db.query(
    `SELECT fp.author_id, ft.course_id FROM forum_posts fp
     JOIN forum_threads ft ON ft.id = fp.thread_id
     WHERE fp.id=$1 AND fp.deleted_at IS NULL`,
    [postId]
  );
  if (!rows[0]) throw ApiError.notFound('Post not found');
  await verifyCourseAccess(userId, rows[0].course_id, role);
  if (role !== 'admin' && role !== 'instructor' && rows[0].author_id !== userId) {
    throw ApiError.forbidden('You can only delete your own posts');
  }
  await db.query('UPDATE forum_posts SET deleted_at=NOW() WHERE id=$1', [postId]);
}

async function markAsAnswer(postId, courseId, userId, role) {
  // Only instructor or admin can mark accepted answer
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id=$1', [courseId]
  );
  if (role !== 'admin' && courseRows[0]?.instructor_id !== userId) {
    throw ApiError.forbidden('Only the instructor can mark an accepted answer');
  }
  // Toggle
  const { rows: postRows } = await db.query(
    `UPDATE forum_posts SET is_answer = NOT is_answer WHERE id=$1 RETURNING thread_id, is_answer`,
    [postId]
  );
  if (!postRows[0]) throw ApiError.notFound('Post not found');
  const nowAnswer = postRows[0].is_answer;
  if (nowAnswer) {
    await db.query(
      'UPDATE forum_threads SET is_answered=true WHERE id=$1', [postRows[0].thread_id]
    );
  } else {
    // Check if any other post in this thread is marked as answer
    const { rows: other } = await db.query(
      `SELECT id FROM forum_posts WHERE thread_id=$1 AND is_answer=true AND id!=$2 AND deleted_at IS NULL`,
      [postRows[0].thread_id, postId]
    );
    if (!other[0]) {
      await db.query(
        'UPDATE forum_threads SET is_answered=false WHERE id=$1', [postRows[0].thread_id]
      );
    }
  }
}

// ── React to a post ───────────────────────────
async function toggleReaction(postId, userId, emoji, role) {
  // Verify the user has access to the post's course
  const { rows: postRows } = await db.query(
    `SELECT fp.id, ft.course_id FROM forum_posts fp
     JOIN forum_threads ft ON ft.id = fp.thread_id
     WHERE fp.id=$1 AND fp.deleted_at IS NULL`,
    [postId]
  );
  if (!postRows[0]) throw ApiError.notFound('Post not found');
  await verifyCourseAccess(userId, postRows[0].course_id, role);

  const existing = await db.query(
    'SELECT id FROM forum_reactions WHERE post_id=$1 AND user_id=$2 AND emoji=$3',
    [postId, userId, emoji]
  );
  if (existing.rows[0]) {
    await db.query('DELETE FROM forum_reactions WHERE id=$1', [existing.rows[0].id]);
    return { action: 'removed' };
  } else {
    await db.query(
      'INSERT INTO forum_reactions (post_id, user_id, emoji) VALUES ($1,$2,$3)',
      [postId, userId, emoji]
    );
    return { action: 'added' };
  }
}

module.exports = {
  listThreads, getThread, createThread, updateThread, deleteThread,
  listPosts, createPost, updatePost, deletePost,
  markAsAnswer, toggleReaction,
};