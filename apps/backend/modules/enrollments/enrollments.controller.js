'use strict';

const service     = require('./enrollments.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');
const paginate    = require('../../shared/utils/pagenate');

async function enroll(req, res, next) {
  try {
    const { courseId, couponCode } = req.body;
    if (!courseId) throw ApiError.badRequest('courseId is required');

    const result = await service.enroll({
      userId: req.user.id, courseId, couponCode
    });
    ApiResponse.created(res, result,
      result.type === 'free_enrollment'
        ? 'Successfully enrolled in course'
        : 'Checkout session created'
    );
  } catch (err) { next(err); }
}

// Raw body needed for Stripe signature verification
async function stripeWebhook(req, res, next) {
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) throw ApiError.badRequest('Missing Stripe signature');
    // raw body must be available — set in server.js for this route
    const result = await service.handleStripeWebhook(req.rawBody || req.body, sig);
    res.json(result);
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
      userId:   req.query.userId,
    });
    ApiResponse.paginated(res, result.enrollments, pagination(result.total));
  } catch (err) { next(err); }
}

async function manualEnroll(req, res, next) {
  try {
    const { userId, courseId } = req.body;
    if (!userId || !courseId) throw ApiError.badRequest('userId and courseId are required');
    const enrollment = await service.manualEnroll(req.user.id, { userId, courseId });
    ApiResponse.created(res, { enrollment }, 'User manually enrolled');
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
    const enrollment = await service.revokeEnrollment(req.params.enrollmentId, req.user.id);
    ApiResponse.success(res, { enrollment }, 'Enrollment revoked');
  } catch (err) { next(err); }
}

module.exports = {
  enroll, stripeWebhook, myEnrollments,
  listEnrollments, manualEnroll, courseEnrollments, revokeEnrollment,
};
