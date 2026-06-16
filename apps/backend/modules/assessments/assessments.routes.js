'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./assessments.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

// ── Quiz CRUD (Instructor / Admin) ────────────
router.post  ('/quizzes',                      authorize('instructor','admin'), controller.createQuiz);
router.get   ('/quizzes/:quizId',              authorize('instructor','admin'), controller.getQuizForInstructor);
router.patch ('/quizzes/:quizId',              authorize('instructor','admin'), controller.updateQuiz);
router.get   ('/quizzes/:quizId/analytics',    authorize('instructor','admin'), controller.getQuizAnalytics);

// ── Question management (Instructor / Admin) ──
router.post  ('/quizzes/:quizId/questions',              authorize('instructor','admin'), controller.addQuestion);
router.patch ('/quizzes/:quizId/questions/:questionId',  authorize('instructor','admin'), controller.updateQuestion);
router.delete('/quizzes/:quizId/questions/:questionId',  authorize('instructor','admin'), controller.deleteQuestion);

// ── Grading short answers (Instructor / Admin) ─
router.patch ('/answers/:answerId/grade',      authorize('instructor','admin'), controller.gradeShortAnswer);

// ── Student — attempt flow ────────────────────
router.post  ('/quizzes/:quizId/start',        controller.startAttempt);
router.post  ('/attempts/:attemptId/submit',   controller.submitAttempt);
router.get   ('/attempts/:attemptId/result',   controller.getAttemptResult);
router.get   ('/quizzes/:quizId/my-attempts',  controller.getMyAttempts);

module.exports = router;