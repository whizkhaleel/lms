'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/apiError');

async function verifyCourseInstructor(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1',
    [courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin'
      && requestingUser.id !== rows[0].instructor_id) {
    throw ApiError.forbidden('Not authorized for this course');
  }
}

// ── Groups ────────────────────────────────────

async function listGroups(courseId) {
  const { rows } = await db.query(
    `SELECT g.*,
       (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id)::int AS member_count
     FROM course_groups g
     WHERE g.course_id = $1
     ORDER BY g.name`,
    [courseId]
  );
  return rows;
}

async function getGroup(groupId) {
  const { rows } = await db.query('SELECT * FROM course_groups WHERE id = $1', [groupId]);
  if (!rows[0]) throw ApiError.notFound('Group not found');
  return rows[0];
}

async function createGroup(courseId, { name, description, maxMembers }, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rows } = await db.query(
    `INSERT INTO course_groups (course_id, name, description, max_members)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [courseId, name, description || null, maxMembers || null]
  );
  return rows[0];
}

async function updateGroup(courseId, groupId, data, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rows } = await db.query(
    `UPDATE course_groups
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         max_members = COALESCE($3, max_members),
         updated_at = NOW()
     WHERE id = $4 AND course_id = $5
     RETURNING *`,
    [data.name, data.description, data.maxMembers, groupId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Group not found');
  return rows[0];
}

async function deleteGroup(courseId, groupId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rowCount } = await db.query(
    'DELETE FROM course_groups WHERE id = $1 AND course_id = $2',
    [groupId, courseId]
  );
  if (rowCount === 0) throw ApiError.notFound('Group not found');
}

// ── Members ───────────────────────────────────

async function listMembers(groupId) {
  const { rows } = await db.query(
    `SELECT m.*, u.first_name, u.last_name, u.email, u.avatar_file_id
     FROM group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1
     ORDER BY m.created_at`,
    [groupId]
  );
  return rows;
}

async function addMember(courseId, groupId, userId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);

  // Verify group belongs to course
  const { rows: grp } = await db.query(
    'SELECT * FROM course_groups WHERE id = $1 AND course_id = $2',
    [groupId, courseId]
  );
  if (!grp[0]) throw ApiError.notFound('Group not found');

  // Verify user is an enrolled student
  const { rows: enrolled } = await db.query(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = $3',
    [userId, courseId, 'active']
  );
  if (!enrolled[0]) throw ApiError.badRequest('User is not an active enrolled student');

  // Check max_members
  if (grp[0].max_members) {
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int AS cnt FROM group_members WHERE group_id = $1',
      [groupId]
    );
    if (countRows[0].cnt >= grp[0].max_members) {
      throw ApiError.badRequest('Group has reached maximum members');
    }
  }

  // Check user is not already in another group in this course
  const { rows: existing } = await db.query(
    `SELECT m.id FROM group_members m
     JOIN course_groups g ON g.id = m.group_id
     WHERE m.user_id = $1 AND g.course_id = $2`,
    [userId, courseId]
  );
  if (existing[0]) throw ApiError.badRequest('User is already in a group for this course');

  const { rows } = await db.query(
    `INSERT INTO group_members (group_id, user_id, course_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [groupId, userId, courseId]
  );
  return rows[0];
}

async function removeMember(courseId, groupId, userId, requestingUser) {
  await verifyCourseInstructor(courseId, requestingUser);
  const { rowCount } = await db.query(
    `DELETE FROM group_members
     WHERE group_id = $1 AND user_id = $2
       AND group_id IN (SELECT id FROM course_groups WHERE course_id = $3)`,
    [groupId, userId, courseId]
  );
  if (rowCount === 0) throw ApiError.notFound('Member not found');
}

// ── Enrolled students (for picking members) ──

async function listEnrolledStudents(courseId) {
  const { rows } = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.email,
       g.id AS group_id, g.name AS group_name
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.course_id = e.course_id
     LEFT JOIN course_groups g ON g.id = gm.group_id
     WHERE e.course_id = $1 AND e.status = 'active'
     ORDER BY u.last_name, u.first_name`,
    [courseId]
  );
  return rows;
}

module.exports = {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup,
  listMembers, addMember, removeMember,
  listEnrolledStudents,
};
