'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db       = require('../../config/db');
const env      = require('../../config/env');
const ApiError = require('../../shared/utils/apiError');

function isCourseManager(user, instructorId) {
  return user.role === 'admin' || user.role === 'super_admin' || user.id === instructorId;
}

async function verifyCourseOwner(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }
  return course;
}

// ── Register an LTI tool ──────────────────────
async function registerTool(courseId, data, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);

  // Generate OAuth credentials if not provided
  const consumerKey = data.consumerKey || uuidv4();
  const consumerSecret = data.consumerSecret || crypto.randomBytes(24).toString('hex');

  const { rows } = await db.query(
    `INSERT INTO lti_tools
       (course_id, title, description, launch_url, consumer_key, consumer_secret, custom_params, lti_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      courseId,
      data.title,
      data.description || null,
      data.launchUrl,
      consumerKey,
      consumerSecret,
      JSON.stringify(data.customParams || {}),
      data.ltiVersion || '1.1',
      requestingUser.id,
    ]
  );

  return rows[0];
}

// ── Update an LTI tool ────────────────────────
async function updateTool(toolId, courseId, data, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);

  const { rows } = await db.query(
    `UPDATE lti_tools SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       launch_url = COALESCE($3, launch_url),
       custom_params = COALESCE($4, custom_params),
       is_active = COALESCE($5, is_active),
       updated_at = NOW()
     WHERE id = $6 AND course_id = $7
     RETURNING *`,
    [
      data.title,
      data.description,
      data.launchUrl,
      data.customParams ? JSON.stringify(data.customParams) : null,
      data.isActive,
      toolId,
      courseId,
    ]
  );
  if (!rows[0]) throw ApiError.notFound('LTI tool not found');
  return rows[0];
}

// ── List tools for a course ────────────────────
async function listTools(courseId) {
  const { rows } = await db.query(
    'SELECT * FROM lti_tools WHERE course_id = $1 ORDER BY created_at DESC',
    [courseId]
  );
  return rows;
}

// ── Get a single tool ──────────────────────────
async function getTool(toolId) {
  const { rows } = await db.query('SELECT * FROM lti_tools WHERE id = $1', [toolId]);
  if (!rows[0]) throw ApiError.notFound('LTI tool not found');
  return rows[0];
}

// ── Delete a tool ──────────────────────────────
async function deleteTool(toolId, courseId, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);
  const { rows } = await db.query(
    'DELETE FROM lti_tools WHERE id = $1 AND course_id = $2 RETURNING id',
    [toolId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('LTI tool not found');
}

// ── Generate LTI launch parameters ─────────────
async function generateLaunch(toolId, lessonId, courseId, user, customParams) {
  const tool = await getTool(toolId);

  if (!tool.is_active) {
    throw ApiError.badRequest('This LTI tool is inactive');
  }

  // Build launch params per LTI 1.1 spec
  const launchParams = {
    lti_message_type: 'basic-lti-launch-request',
    lti_version: tool.lti_version || '1.1',
    resource_link_id: lessonId || toolId,
    resource_link_title: tool.title,
    user_id: user.id,
    roles: user.role === 'admin' || user.role === 'super_admin'
      ? 'Administrator'
      : user.role === 'instructor'
        ? 'Instructor'
        : 'Learner',
    lis_person_name_given: user.firstName || '',
    lis_person_name_family: user.lastName || '',
    lis_person_contact_email_primary: user.email || '',
    context_id: courseId,
    context_title: (await db.query('SELECT title FROM courses WHERE id=$1', [courseId])).rows[0]?.title || '',
    context_label: courseId.substring(0, 8),
    launch_presentation_locale: 'en-US',
    launch_presentation_document_target: 'iframe',
    launch_presentation_return_url: env.APP_URL + '/learn/' + courseId,
    tool_consumer_instance_guid: env.APP_URL || 'lms.local',
    tool_consumer_instance_name: env.APP_NAME || 'LMS',
    tool_consumer_instance_contact_email: 'admin@' + (env.APP_URL ? env.APP_URL.replace(/https?:\/\//, '') : 'lms.local'),
    lis_result_sourcedid: `${courseId}:${lessonId}:${user.id}:${toolId}`,
  };

  // Merge custom parameters from the tool definition
  if (tool.custom_params && typeof tool.custom_params === 'object') {
    Object.keys(tool.custom_params).forEach(key => {
      launchParams[`custom_${key}`] = tool.custom_params[key];
    });
  }

  // Override with any lesson-specific custom params
  if (customParams && typeof customParams === 'object') {
    Object.keys(customParams).forEach(key => {
      launchParams[`custom_${key}`] = customParams[key];
    });
  }

  // Add OAuth 1.0a signature
  const oauthParams = signOAuth(launchParams, tool.launch_url, tool.consumer_key, tool.consumer_secret);

  const allParams = { ...launchParams, ...oauthParams };

  // Record the launch session
  const { rows } = await db.query(
    `INSERT INTO lti_launches
       (tool_id, lesson_id, user_id, course_id, launch_params, oauth_signature, lis_result_sourcedid)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      toolId,
      lessonId || null,
      user.id,
      courseId,
      JSON.stringify(allParams),
      oauthParams.oauth_signature,
      launchParams.lis_result_sourcedid,
    ]
  );

  return {
    launchUrl: tool.launch_url,
    launchParams: allParams,
    launchId: rows[0].id,
  };
}

// ── OAuth 1.0a Signature (LTI 1.0/1.1) ────────
function signOAuth(params, url, consumerKey, consumerSecret) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };

  // Build base string per OAuth 1.0a spec
  const allParams = { ...params, ...oauth };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(allParams[key])))
    .join('&');

  const baseString = [
    'POST',
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = encodeURIComponent(consumerSecret) + '&';
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauth.oauth_signature = signature;
  return oauth;
}

// ── Get LTI tool by lesson association ────────
// For mapping an LTI lesson to its registered tool
async function getToolByLesson(courseId, lessonId) {
  // The lesson stores the tool_id in its content field as JSON
  const { rows: lessonRows } = await db.query(
    'SELECT content FROM lessons WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL',
    [lessonId, courseId]
  );
  if (!lessonRows[0]) throw ApiError.notFound('Lesson not found');

  let content;
  try {
    content = JSON.parse(lessonRows[0].content || '{}');
  } catch {
    throw ApiError.badRequest('Invalid lesson content');
  }

  if (!content.toolId) throw ApiError.notFound('No LTI tool associated with this lesson');

  return getTool(content.toolId);
}

module.exports = {
  registerTool,
  updateTool,
  listTools,
  getTool,
  deleteTool,
  generateLaunch,
  getToolByLesson,
};
