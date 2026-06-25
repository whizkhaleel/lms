'use strict';

const service     = require('./enrollments.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');
const paginate    = require('../../shared/utils/pagenate');

async function enroll(req, res, next) {
  try {
    const { courseId } = req.body;
    if (!courseId) throw ApiError.badRequest('courseId is required');
    const result = await service.enroll({ userId: req.user.id, courseId });
    ApiResponse.created(res, result, 'Successfully enrolled in course');
  } catch (err) { next(err); }
}

async function myEnrollments(req, res, next) {
  try {
    const enrollments = await service.myEnrollments(req.user.id);
    ApiResponse.success(res, { enrollments });
  } catch (err) { next(err); }
}

async function listEnrollments(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const result = await service.listEnrollments({
      page: req.query.page, limit,
      courseId: req.query.courseId,
      search: req.query.search,
      status: req.query.status,
    });
    ApiResponse.paginated(res, result.enrollments, pagination(result.total));
  } catch (err) { next(err); }
}

async function manualEnroll(req, res, next) {
  try {
    const { userId, courseId } = req.body;
    if (!userId || !courseId) throw ApiError.badRequest('userId and courseId are required');
    const enrollment = await service.manualEnroll(req.user.id, { userId, courseId });
    ApiResponse.created(res, { enrollment }, 'Student enrolled successfully');
  } catch (err) { next(err); }
}

async function courseEnrollments(req, res, next) {
  try {
    const enrollments = await service.courseEnrollments(req.params.courseId);
    ApiResponse.success(res, { enrollments });
  } catch (err) { next(err); }
}

async function revokeEnrollment(req, res, next) {
  try {
    await service.revokeEnrollment(req.params.enrollmentId, req.user.id);
    ApiResponse.success(res, {}, 'Enrollment revoked');
  } catch (err) { next(err); }
}

// ── External payment gateway webhook ──────────
// req.body here is a raw Buffer (see server.js raw-body middleware)
async function paymentWebhook(req, res, next) {
  try {
    const result = await service.receiveWebhook(req);
    res.status(200).json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ── Admin: list pending external enrollments ────
async function listPending(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const result = await service.listPendingEnrollments({
      page: req.query.page, limit,
    });
    ApiResponse.paginated(res, result.payments, pagination(result.total));
  } catch (err) { next(err); }
}

// ── Admin: approve a pending enrollment ─────────
async function approvePending(req, res, next) {
  try {
    const result = await service.approvePendingEnrollment(req.params.paymentId, req.user.id);
    ApiResponse.success(res, result, 'Enrollment approved');
  } catch (err) { next(err); }
}

// ── Admin: reject a pending enrollment ──────────
async function rejectPending(req, res, next) {
  try {
    const { reason } = req.body;
    const result = await service.rejectPendingEnrollment(req.params.paymentId, req.user.id, reason);
    ApiResponse.success(res, result, 'Enrollment rejected');
  } catch (err) { next(err); }
}

module.exports = {
  enroll, myEnrollments, listEnrollments,
  manualEnroll, courseEnrollments, revokeEnrollment,
  paymentWebhook,
  listPending, approvePending, rejectPending,
};
