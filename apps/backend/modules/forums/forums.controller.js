'use strict';

const Joi         = require('joi');
const service     = require('./forums.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');

const createThreadSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
  title:    Joi.string().trim().min(3).max(500).required(),
  content:  Joi.string().trim().min(1).required(),
});

const updateThreadSchema = Joi.object({
  title:   Joi.string().trim().min(3).max(500),
  content: Joi.string().trim().min(1),
}).min(1);

const createPostSchema = Joi.object({
  content:  Joi.string().trim().min(1).required(),
  parentId: Joi.string().uuid().allow(null),
});

// ── Threads ──────────────────────────────────

async function listThreads(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!courseId) throw ApiError.badRequest('courseId is required');
    const result = await service.listThreads(courseId, req.query, req.user);
    ApiResponse.paginated(res, result.threads, result);
  } catch (err) { next(err); }
}

async function getThread(req, res, next) {
  try {
    const thread = await service.getThread(req.params.threadId, req.user);
    ApiResponse.success(res, { thread });
  } catch (err) { next(err); }
}

async function createThread(req, res, next) {
  try {
    const { error, value } = createThreadSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const thread = await service.createThread(value.courseId, value, req.user);
    ApiResponse.created(res, { thread }, 'Thread created');
  } catch (err) { next(err); }
}

async function updateThread(req, res, next) {
  try {
    const { error, value } = updateThreadSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const thread = await service.updateThread(req.params.threadId, value, req.user);
    ApiResponse.success(res, { thread }, 'Thread updated');
  } catch (err) { next(err); }
}

async function deleteThread(req, res, next) {
  try {
    await service.deleteThread(req.params.threadId, req.user);
    ApiResponse.success(res, {}, 'Thread deleted');
  } catch (err) { next(err); }
}

async function pinThread(req, res, next) {
  try {
    const pin = req.body.pin !== false;
    const thread = await service.pinThread(req.params.threadId, pin, req.user);
    ApiResponse.success(res, { thread }, pin ? 'Thread pinned' : 'Thread unpinned');
  } catch (err) { next(err); }
}

async function lockThread(req, res, next) {
  try {
    const lock = req.body.lock !== false;
    const thread = await service.lockThread(req.params.threadId, lock, req.user);
    ApiResponse.success(res, { thread }, lock ? 'Thread locked' : 'Thread unlocked');
  } catch (err) { next(err); }
}

// ── Posts ────────────────────────────────────

async function createPost(req, res, next) {
  try {
    const { error, value } = createPostSchema.validate(req.body, { abortEarly: false });
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));
    const post = await service.createPost(req.params.threadId, value, req.user);
    ApiResponse.created(res, { post }, 'Reply posted');
  } catch (err) { next(err); }
}

async function updatePost(req, res, next) {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') throw ApiError.badRequest('content is required');
    const post = await service.updatePost(req.params.postId, content, req.user);
    ApiResponse.success(res, { post }, 'Post updated');
  } catch (err) { next(err); }
}

async function deletePost(req, res, next) {
  try {
    await service.deletePost(req.params.postId, req.user);
    ApiResponse.success(res, {}, 'Post deleted');
  } catch (err) { next(err); }
}

async function markAnswer(req, res, next) {
  try {
    const post = await service.markAnswer(req.params.postId, req.user);
    ApiResponse.success(res, { post }, post.is_answer ? 'Marked as answer' : 'Unmarked as answer');
  } catch (err) { next(err); }
}

async function toggleReaction(req, res, next) {
  try {
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string') throw ApiError.badRequest('emoji is required');
    const result = await service.toggleReaction(req.params.postId, emoji, req.user);
    ApiResponse.success(res, result, result.reacted ? 'Reacted' : 'Reaction removed');
  } catch (err) { next(err); }
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
};
