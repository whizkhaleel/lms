'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');
const pagenate = require('../../shared/utils/pagenate');
const { notifyMany } = require('../notifications/notifications.service');

async function verifyCourseInstructor(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1',
    [courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Course not found');
  const isOwner = requestingUser.role === 'admin'
    || requestingUser.role === 'super_admin'
    || requestingUser.id === rows[0].instructor_id;
  if (!isOwner) throw ApiError.forbidden('Not authorized for this course');
  return rows[0];
}

async function listAnnouncements(courseId, query = {}) {
  const { page, limit, offset, pagination } = pagenate(query);

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS total FROM course_announcements WHERE course_id = $1',
    [courseId]
  );
  const total = countRows[0]?.total || 0;

  const { rows } = await db.query(
    `SELECT ca.*, u.first_name, u.last_name
     FROM course_announcements ca
     JOIN users u ON u.id = ca.instructor_id
     WHERE ca.course_id = $1
     ORDER BY ca.created_at DESC
     LIMIT $2 OFFSET $3`,
    [courseId, limit, offset]
  );

  return { announcements: rows, pagination: pagination(total) };
}

async function createAnnouncement(courseId, { title, body }, io, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  const { rows } = await db.query(
    `INSERT INTO course_announcements (course_id, instructor_id, title, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [courseId, requestingUser.id, title, body || '']
  );
  const ann = rows[0];

  // Notify all enrolled students
  const { rows: enrolled } = await db.query(
    'SELECT user_id FROM enrollments WHERE course_id = $1 AND status = $2',
    [courseId, 'active']
  );
  const userIds = enrolled.map(e => e.user_id);

  if (userIds.length > 0) {
    await notifyMany(io, userIds, {
      type:  'course_announcement',
      title: ann.title,
      body:  ann.body || undefined,
      data:  { courseId, announcementId: ann.id },
    });
  }

  return ann;
}

async function updateAnnouncement(courseId, announcementId, { title, body }, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  const { rows } = await db.query(
    `UPDATE course_announcements
     SET title = COALESCE($1, title), body = COALESCE($2, body), updated_at = NOW()
     WHERE id = $3 AND course_id = $4 RETURNING *`,
    [title, body, announcementId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Announcement not found');
  return rows[0];
}

async function deleteAnnouncement(courseId, announcementId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  const { rowCount } = await db.query(
    'DELETE FROM course_announcements WHERE id = $1 AND course_id = $2',
    [announcementId, courseId]
  );
  if (rowCount === 0) throw ApiError.notFound('Announcement not found');
}

module.exports = {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
