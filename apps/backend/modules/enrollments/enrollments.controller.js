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
    const { limit, offset, pagination } = paginate(req.query);
    const result = await service.listEnrollments({
      page: req.query.page, limit,
      courseId: req.query.courseId,
      userId:   req.query.userId,
    });
    ApiResponse.paginated(res, result.enrollments, pagination(result.total));
  } catch (err) { next(err); }
}

async function manualEnroll(req, res, next) {
  try {
    const { userId, courseId, note } = req.body;
    if (!userId || !courseId) throw ApiError.badRequest('userId and courseId are required');
    const enrollment = await service.manualEnroll(req.user.id, { userId, courseId, note });
    ApiResponse.created(res, { enrollment }, 'Student enrolled successfully');
  } catch (err) { next(err); }
}

async function courseEnrollments(req, res, next) {
  try {
    const enrollments = await service.courseEnrollments(req.params.courseId, req.user);
    ApiResponse.success(res, { enrollments });
  } catch (err) { next(err); }
}

async function revokeEnrollment(req, res, next) {
  try {
    const { reason } = req.body;
    const enrollment = await service.revokeEnrollment(
      req.params.enrollmentId, req.user.id, reason
    );
    ApiResponse.success(res, { enrollment }, 'Enrollment revoked');
  } catch (err) { next(err); }
}

async function recordPayment(req, res, next) {
  try {
    const { userId, courseId, amount, currency, paymentMethod, reference, notes } = req.body;
    if (!userId || !courseId || !amount) {
      throw ApiError.badRequest('userId, courseId, and amount are required');
    }
    const payment = await service.recordPayment(req.user.id, {
      userId, courseId, amount, currency, paymentMethod, reference, notes
    });
    ApiResponse.created(res, { payment }, 'Payment recorded');
  } catch (err) { next(err); }
}

async function confirmPayment(req, res, next) {
  try {
    const result = await service.confirmPayment(req.params.paymentId, req.user.id);
    ApiResponse.success(res, result, 'Payment confirmed — student enrolled');
  } catch (err) { next(err); }
}

async function rejectPayment(req, res, next) {
  try {
    const { reason } = req.body;
    const payment = await service.rejectPayment(req.params.paymentId, req.user.id, reason);
    ApiResponse.success(res, { payment }, 'Payment rejected');
  } catch (err) { next(err); }
}

async function listPayments(req, res, next) {
  try {
    const { limit, offset, pagination } = paginate(req.query);
    const result = await service.listPayments({
      page: req.query.page, limit,
      status:   req.query.status,
      courseId: req.query.courseId,
      userId:   req.query.userId,
    });
    ApiResponse.paginated(res, result.payments, pagination(result.total));
  } catch (err) { next(err); }
}

module.exports = {
  enroll, myEnrollments, listEnrollments,
  manualEnroll, courseEnrollments, revokeEnrollment,
  recordPayment, confirmPayment, rejectPayment, listPayments,
};