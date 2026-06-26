'use strict';

const service    = require('./lti.service');
const ApiResponse = require('../../shared/utils/apiResponse');

async function registerTool(req, res, next) {
  try {
    const tool = await service.registerTool(req.params.courseId, req.body, req.user);
    ApiResponse.success(res, { tool }, 'Tool registered', 201);
  } catch (err) { next(err); }
}

async function updateTool(req, res, next) {
  try {
    const tool = await service.updateTool(req.params.toolId, req.params.courseId, req.body, req.user);
    ApiResponse.success(res, { tool }, 'Tool updated');
  } catch (err) { next(err); }
}

async function listTools(req, res, next) {
  try {
    const tools = await service.listTools(req.params.courseId);
    ApiResponse.success(res, { tools });
  } catch (err) { next(err); }
}

async function getTool(req, res, next) {
  try {
    const tool = await service.getTool(req.params.toolId);
    ApiResponse.success(res, { tool });
  } catch (err) { next(err); }
}

async function deleteTool(req, res, next) {
  try {
    await service.deleteTool(req.params.toolId, req.params.courseId, req.user);
    ApiResponse.success(res, null, 'Tool deleted');
  } catch (err) { next(err); }
}

// ── Generate an LTI launch ─────────────────────
async function launchTool(req, res, next) {
  try {
    const { toolId, lessonId, courseId } = req.params;
    const customParams = req.body.customParams || {};
    const launch = await service.generateLaunch(toolId, lessonId, courseId, req.user, customParams);

    // Return the launch URL and params so the frontend can auto-submit a form
    ApiResponse.success(res, launch);
  } catch (err) { next(err); }
}

// ── Get tool by lesson ─────────────────────────
async function getToolByLesson(req, res, next) {
  try {
    const tool = await service.getToolByLesson(req.params.courseId, req.params.lessonId);
    ApiResponse.success(res, { tool });
  } catch (err) { next(err); }
}

module.exports = {
  registerTool,
  updateTool,
  listTools,
  getTool,
  deleteTool,
  launchTool,
  getToolByLesson,
};
