'use strict';

const db      = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

async function listEvents(courseId, userId, role, filters) {
  const conditions = ['ce.deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  // Course-scoped or all courses
  if (courseId) {
    conditions.push(`ce.course_id = $${idx++}`);
    params.push(courseId);
  }

  // Own events or course events (students see only enrolled courses events)
  if (role === 'student') {
    conditions.push(
      `(ce.created_by = $${idx} OR ce.course_id IN (
        SELECT course_id FROM enrollments WHERE user_id = $${idx} AND status = 'active'
      ))`
    );
    params.push(userId);
    idx++;
  }

  // Date range filter
  if (filters.startDate) {
    conditions.push(`ce.start_date >= $${idx++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`ce.start_date <= $${idx++}`);
    params.push(filters.endDate);
  }

  // Event type filter
  if (filters.eventType) {
    conditions.push(`ce.event_type = $${idx++}`);
    params.push(filters.eventType);
  }

  const { rows } = await db.query(
    `SELECT ce.*, c.title AS course_title
     FROM calendar_events ce
     LEFT JOIN courses c ON c.id = ce.course_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ce.start_date ASC`,
    params
  );
  return rows;
}

async function createEvent(data, userId) {
  const { rows } = await db.query(
    `INSERT INTO calendar_events
       (title, description, event_type, start_date, end_date, all_day,
        course_id, reference_type, reference_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.title, data.description || null, data.eventType || 'manual',
      data.startDate, data.endDate || null, data.allDay ?? false,
      data.courseId || null, data.referenceType || null,
      data.referenceId || null, userId,
    ]
  );
  return rows[0];
}

async function updateEvent(eventId, data, userId, role) {
  const { rows: existing } = await db.query(
    'SELECT * FROM calendar_events WHERE id = $1 AND deleted_at IS NULL',
    [eventId]
  );
  if (!existing[0]) throw ApiError.notFound('Event not found');

  // Only creator or admin/instructor can edit
  if (existing[0].created_by !== userId && role === 'student') {
    throw ApiError.forbidden('Access denied');
  }

  const { rows } = await db.query(
    `UPDATE calendar_events SET
       title       = COALESCE($1, title),
       description = COALESCE($2, description),
       event_type  = COALESCE($3, event_type),
       start_date  = COALESCE($4, start_date),
       end_date    = COALESCE($5, end_date),
       all_day     = COALESCE($6, all_day),
       updated_at  = NOW()
     WHERE id = $7 RETURNING *`,
    [
      data.title, data.description, data.eventType,
      data.startDate, data.endDate, data.allDay,
      eventId,
    ]
  );
  return rows[0];
}

async function deleteEvent(eventId, userId, role) {
  const { rows: existing } = await db.query(
    'SELECT * FROM calendar_events WHERE id = $1 AND deleted_at IS NULL',
    [eventId]
  );
  if (!existing[0]) throw ApiError.notFound('Event not found');

  if (existing[0].created_by !== userId && role === 'student') {
    throw ApiError.forbidden('Access denied');
  }

  await db.query(
    'UPDATE calendar_events SET deleted_at = NOW() WHERE id = $1',
    [eventId]
  );
}

module.exports = { listEvents, createEvent, updateEvent, deleteEvent };
