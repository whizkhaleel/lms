'use strict';

const Joi         = require('joi');
const service     = require('./forums.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');
const paginate    = require('../../shared/utils/pagenate');

// ── Validation ────────────────────────────────
const threadSchema = Joi.object({
  title:   Joi.string().trim().min(5).max(500).required(),
  content: Joi.string().trim().min(10).max(20000).required(),
});

const postSchema = Joi.object({
  content:  Joi.string().trim().min(1).max(20000).required(),
  parentId: Joi.string().uuid().allow(null),
});

// ── Threads ───────────────────────────────────
async function listThreads(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const result = await service.listThreads(
      req.params.courseId, req.user.id, req.user.role,
      { page: req.query.page, limit, sort: req.query.sort, search: req.query.search }
    );
    ApiResponse.paginated(res, result.threads, pagination(result.total));
  } catch (err) { next(err); }
}

async function getThread(req, res, next) {
  try {
    const thread = await service.getThread(
      req.params.threadId, req.params.courseId, req.user.id, req.user.role
    );
    ApiResponse.success(res, { thread });
  } catch (err) { next(err); }
}

async function createThread(req, res, next) {
  try {
    const { error, value } = threadSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const io     = req.app.get('io');
    const thread = await service.createThread(
      req.params.courseId, req.user.id, req.user.role, value
    );
    // Notify instructor of new thread
    if (thread._notifyInstructorId) {
      const { notify } = require('../notifications/notifications.service');
      const { rows } = await require('../../config/db').query(
        'SELECT first_name, last_name FROM users WHERE id=$1', [req.user.id]
      );
      const name = rows[0] ? `${rows[0].first_name} ${rows[0].last_name}` : 'A student';
      await notify(io, {
        userId: thread._notifyInstructorId,
        type:   'forum_reply',
        title:  'New forum thread in your course',
        body:   `${name} started: "${thread.title}"`,
        data:   { threadId: thread.id, courseId: req.params.courseId },
      });
      delete thread._notifyInstructorId;
    }
    ApiResponse.created(res, { thread }, 'Thread created');
  } catch (err) { next(err); }
}

async function updateThread(req, res, next) {
  try {
    const thread = await service.updateThread(
      req.params.threadId, req.user.id, req.user.role, req.body
    );
    ApiResponse.success(res, { thread }, 'Thread updated');
  } catch (err) { next(err); }
}

async function deleteThread(req, res, next) {
  try {
    await service.deleteThread(req.params.threadId, req.user.id, req.user.role);
    ApiResponse.success(res, {}, 'Thread deleted');
  } catch (err) { next(err); }
}

async function pinThread(req, res, next) {
  try {
    const thread = await service.updateThread(
      req.params.threadId, req.user.id, req.user.role,
      { isPinned: req.body.pinned ?? true }
    );
    ApiResponse.success(res, { thread }, `Thread ${thread.is_pinned ? 'pinned' : 'unpinned'}`);
  } catch (err) { next(err); }
}

async function lockThread(req, res, next) {
  try {
    const thread = await service.updateThread(
      req.params.threadId, req.user.id, req.user.role,
      { isLocked: req.body.locked ?? true }
    );
    ApiResponse.success(res, { thread }, `Thread ${thread.is_locked ? 'locked' : 'unlocked'}`);
  } catch (err) { next(err); }
}

// ── Posts ─────────────────────────────────────
async function listPosts(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const result = await service.listPosts(
      req.params.threadId, req.params.courseId,
      req.user.id, req.user.role,
      { page: req.query.page, limit }
    );
    ApiResponse.paginated(res, result.posts, pagination(result.total));
  } catch (err) { next(err); }
}

async function createPost(req, res, next) {
  try {
    const { error, value } = postSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const io   = req.app.get('io');
    const post = await service.createPost(
      req.params.threadId, req.params.courseId,
      req.user.id, req.user.role, value, io
    );
    ApiResponse.created(res, { post }, 'Reply posted');
  } catch (err) { next(err); }
}

async function updatePost(req, res, next) {
  try {
    if (!req.body.content) throw ApiError.badRequest('content is required');
    const post = await service.updatePost(
      req.params.postId, req.user.id, req.user.role, req.body
    );
    ApiResponse.success(res, { post }, 'Post updated');
  } catch (err) { next(err); }
}

async function deletePost(req, res, next) {
  try {
    await service.deletePost(req.params.postId, req.user.id, req.user.role);
    ApiResponse.success(res, {}, 'Post deleted');
  } catch (err) { next(err); }
}

async function markAsAnswer(req, res, next) {
  try {
    await service.markAsAnswer(
      req.params.postId, req.params.courseId, req.user.id, req.user.role
    );
    ApiResponse.success(res, {}, 'Post marked as accepted answer');
  } catch (err) { next(err); }
}

async function toggleReaction(req, res, next) {
  try {
    const { emoji } = req.body;
    if (!emoji) throw ApiError.badRequest('emoji is required');
    const result = await service.toggleReaction(req.params.postId, req.user.id, emoji);
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
}

module.exports = {
  listThreads, getThread, createThread, updateThread, deleteThread,
  pinThread, lockThread,
  listPosts, createPost, updatePost, deletePost,
  markAsAnswer, toggleReaction,
};