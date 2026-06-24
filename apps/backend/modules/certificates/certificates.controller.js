'use strict';

const service     = require('./certificates.service');
const ApiResponse = require('../../shared/utils/apiResponse');

async function myCertificates(req, res, next) {
  try {
    const certs = await service.listUserCertificates(req.user.id);
    ApiResponse.success(res, { certificates: certs });
  } catch (err) { next(err); }
}

async function courseCertificates(req, res, next) {
  try {
    const certs = await service.listCourseCertificates(req.params.courseId, req.user);
    ApiResponse.success(res, { certificates: certs });
  } catch (err) { next(err); }
}

async function myXp(req, res, next) {
  try {
    const [xp, badges] = await Promise.all([
      service.getUserXp(req.user.id),
      service.getUserBadges(req.user.id),
    ]);
    ApiResponse.success(res, { xp, badges });
  } catch (err) { next(err); }
}

async function leaderboard(req, res, next) {
  try {
    const entries = await service.getLeaderboard({ limit: parseInt(req.query.limit) || 50 });
    // Include requesting user's rank
    const userXp = await service.getUserXp(req.user.id);
    const userRank = entries.findIndex(e => e.id === req.user.id) + 1;
    ApiResponse.success(res, { entries, userXp, userRank: userRank || null });
  } catch (err) { next(err); }
}

module.exports = {
  myCertificates,
  courseCertificates,
  myXp,
  leaderboard,
};
