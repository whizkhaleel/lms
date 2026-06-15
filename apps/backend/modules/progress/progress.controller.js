'use strict';

const Joi = require('joi');
const service = require('./progress.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError = require('../../shared/utils/apiError');

// ── Heartbeat ─────────────────────────────────
async function heartbeat(req, res, next) {
    try {
        const schema = Joi.object({
            lessonId: Joi.string().uuid().required(),
            courseId: Joi.string().uuid().required(),
            positionSecs: Joi.number().integer().min(0).required(),
            watchedSecs: Joi.number().integer().min(0).required(),
        });
        const { error, value } = schema.validate(req.body);
        if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

        const result = await service.heartbeat({ userId: req.user.id, ...value });
        // 204 No Content is tempting here but we return data for the player UI
        ApiResponse.success(res, result);
    } catch (err) { next(err); }
}

// ── Mark lesson complete ───────────────────────
async function markComplete(req, res, next) {
    try {
        const result = await service.markComplete(
            req.user.id, req.params.lessonId, req.body.courseId
        );
        ApiResponse.success(res, result, 'Lesson marked as complete');
    } catch (err) { next(err); }
}

// ── Mark lesson incomplete ─────────────────────
async function markIncomplete(req, res, next) {
    try {
        const result = await service.markIncomplete(
            req.user.id, req.params.lessonId, req.body.courseId
        );
        ApiResponse.success(res, result, 'Lesson marked as incomplete');
    } catch (err) { next(err); }
}

// ── Get lesson progress (resume position) ─────
async function getLessonProgress(req, res, next) {
    try {
        const progress = await service.getLessonProgress(
            req.user.id, req.params.lessonId, req.query.courseId
        );
        ApiResponse.success(res, { progress });
    } catch (err) { next(err); }
}

// ── Get full course progress ───────────────────
async function getCourseProgress(req, res, next) {
    try {
        const progress = await service.getCourseProgress(
            req.user.id, req.params.courseId
        );
        ApiResponse.success(res, { progress });
    } catch (err) { next(err); }
}

// ── Student dashboard ─────────────────────────
async function getDashboard(req, res, next) {
    try {
        const data = await service.getDashboard(req.user.id);
        ApiResponse.success(res, data);
    } catch (err) { next(err); }
}

// ── Bookmarks ─────────────────────────────────
async function addBookmark(req, res, next) {
    try {
        const { positionSecs, label } = req.body;
        if (positionSecs === undefined) throw ApiError.badRequest('positionSecs is required');

        const bookmark = await service.addBookmark(
            req.user.id, req.params.lessonId, positionSecs, label
        );
        ApiResponse.created(res, { bookmark }, 'Bookmark added');
    } catch (err) { next(err); }
}

async function getBookmarks(req, res, next) {
    try {
        const bookmarks = await service.getBookmarks(req.user.id, req.params.lessonId);
        ApiResponse.success(res, { bookmarks });
    } catch (err) { next(err); }
}

async function deleteBookmark(req, res, next) {
    try {
        await service.deleteBookmark(
            req.user.id, req.params.lessonId, req.params.bookmarkId
        );
        ApiResponse.success(res, {}, 'Bookmark deleted');
    } catch (err) { next(err); }
}

// ── Instructor analytics ───────────────────────
async function getCourseAnalytics(req, res, next) {
    try {
        const data = await service.getCourseAnalytics(req.params.courseId, req.user);
        ApiResponse.success(res, data);
    } catch (err) { next(err); }
}

module.exports = {
    heartbeat,
    markComplete,
    markIncomplete,
    getLessonProgress,
    getCourseProgress,
    getDashboard,
    addBookmark,
    getBookmarks,
    deleteBookmark,
    getCourseAnalytics,
};