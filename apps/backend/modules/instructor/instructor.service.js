'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

async function listStudents(instructorId) {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
     FROM users u
     JOIN enrollments e ON e.user_id = u.id AND e.status = 'active'
     JOIN courses c ON c.id = e.course_id AND c.deleted_at IS NULL
     WHERE c.instructor_id = $1 AND u.deleted_at IS NULL AND u.role = 'student'
     ORDER BY u.first_name, u.last_name`,
    [instructorId]
  );
  return rows;
}

module.exports = { listStudents };
