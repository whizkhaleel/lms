'use strict';

const db       = require('../../config/db');
const ApiError = require('../../shared/utils/ApiError');
const eventBus = require('../../shared/events/eventBus');

// ─────────────────────────────────────────────────────────────
//  PROGRESS SERVICE
//
//  The heartbeat loop:
//    Player pings  POST /progress/heartbeat  every 10 seconds
//      → upserts lesson_progress (position + watched_secs)
//      → if watched ≥ 80% of duration → auto-mark complete
//
//  Manual complete:
//    Student clicks "Mark Complete"  POST /progress/complete
//      → marks lesson complete
//      → recomputes course_progress snapshot
//      → emits lesson.completed event
//      → if course now 100% → emits course.completed event
// ─────────────────────────────────────────────────────────────

// ── Verify student is enrolled ────────────────
async function getEnrollment(userId, courseId) {
  const { rows } = await db.query(
    `SELECT id FROM enrollments
     WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
    [userId, courseId]
  );
  if (!rows[0]) throw ApiError.forbidden('You are not enrolled in this course');
  return rows[0];
}

// ─────────────────────────────────────────────
//  HEARTBEAT
//  Called every ~10 seconds by the video player.
//  Keeps track of exact watch position and total
//  seconds actually watched (deduped by range tracking).
// ─────────────────────────────────────────────
async function heartbeat({ userId, lessonId, courseId, positionSecs, watchedSecs }) {
  const enrollment = await getEnrollment(userId, courseId);

  // Load lesson duration for auto-complete check
  const { rows: lessonRows } = await db.query(
    `SELECT duration_seconds, is_published FROM lessons
     WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL`,
    [lessonId, courseId]
  );
  const lesson = lessonRows[0];
  if (!lesson || !lesson.is_published) throw ApiError.notFound('Lesson not found');

  // Auto-complete trigger: student watched ≥ 80% of the video
  const duration      = lesson.duration_seconds || 0;
  const shouldComplete = duration > 0 && watchedSecs >= duration * 0.8;

  const { rows } = await db.query(
    `INSERT INTO lesson_progress
       (user_id, lesson_id, course_id, enrollment_id,
        watch_position_secs, watched_secs, play_count,
        first_watched_at, last_watched_at, is_completed, completed_at)
     VALUES ($1,$2,$3,$4, $5,$6, 1, NOW(), NOW(),
             $7, CASE WHEN $7 THEN NOW() ELSE NULL END)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       watch_position_secs = $5,
       -- only increase watched_secs, never decrease (deduplication)
       watched_secs        = GREATEST(lesson_progress.watched_secs, $6),
       last_watched_at     = NOW(),
       play_count          = CASE
                               WHEN lesson_progress.watch_position_secs = 0
                               THEN lesson_progress.play_count + 1
                               ELSE lesson_progress.play_count
                             END,
       -- once complete, stays complete
       is_completed        = lesson_progress.is_completed OR $7,
       completed_at        = CASE
                               WHEN lesson_progress.is_completed OR $7
                               THEN COALESCE(lesson_progress.completed_at, NOW())
                               ELSE NULL
                             END,
       first_watched_at    = COALESCE(lesson_progress.first_watched_at, NOW())
     RETURNING *`,
    [userId, lessonId, courseId, enrollment.id,
     positionSecs, watchedSecs, shouldComplete]
  );

  const progress = rows[0];

  // If lesson just became complete, recompute course snapshot
  if (shouldComplete) {
    await recomputeCourseProgress(userId, courseId, enrollment.id);
  }

  return {
    lessonId,
    watchPosition: progress.watch_position_secs,
    watchedSecs:   progress.watched_secs,
    isCompleted:   progress.is_completed,
  };
}

// ─────────────────────────────────────────────
//  MANUAL MARK COMPLETE / INCOMPLETE
// ─────────────────────────────────────────────
async function markComplete(userId, lessonId, courseId) {
  const enrollment = await getEnrollment(userId, courseId);

  const { rows: lessonRows } = await db.query(
    'SELECT id FROM lessons WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL',
    [lessonId, courseId]
  );
  if (!lessonRows[0]) throw ApiError.notFound('Lesson not found');

  const { rows } = await db.query(
    `INSERT INTO lesson_progress
       (user_id, lesson_id, course_id, enrollment_id,
        is_completed, completed_at, first_watched_at, last_watched_at)
     VALUES ($1,$2,$3,$4, true, NOW(), NOW(), NOW())
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       is_completed = true,
       completed_at = COALESCE(lesson_progress.completed_at, NOW()),
       last_watched_at = NOW()
     RETURNING is_completed, completed_at`,
    [userId, lessonId, courseId, enrollment.id]
  );

  const courseSnap = await recomputeCourseProgress(userId, courseId, enrollment.id);

  eventBus.emit('lesson.completed', { userId, lessonId, courseId });

  return {
    lesson:  rows[0],
    course:  courseSnap,
  };
}

async function markIncomplete(userId, lessonId, courseId) {
  await getEnrollment(userId, courseId);

  await db.query(
    `UPDATE lesson_progress
     SET is_completed = false, completed_at = NULL
     WHERE user_id = $1 AND lesson_id = $2`,
    [userId, lessonId]
  );

  const enrollment = await getEnrollment(userId, courseId);
  const courseSnap = await recomputeCourseProgress(userId, courseId, enrollment.id);
  return { course: courseSnap };
}

// ─────────────────────────────────────────────
//  RECOMPUTE COURSE PROGRESS SNAPSHOT
//  Called after every lesson completion change.
//  Updates course_progress + enrollments tables.
//  Fires course.completed event if 100%.
// ─────────────────────────────────────────────
async function recomputeCourseProgress(userId, courseId, enrollmentId) {
  // Count published lessons and how many this user completed
  const { rows: statsRows } = await db.query(
    `SELECT
       COUNT(l.id)                                        AS total_lessons,
       COUNT(lp.id) FILTER (WHERE lp.is_completed = true) AS completed_lessons,
       COALESCE(SUM(lp.watched_secs), 0)                 AS total_watched_secs
     FROM lessons l
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.id AND lp.user_id = $1
     WHERE l.course_id = $2
       AND l.is_published = true
       AND l.deleted_at IS NULL`,
    [userId, courseId]
  );

  const stats   = statsRows[0];
  const total   = parseInt(stats.total_lessons,     10);
  const done    = parseInt(stats.completed_lessons, 10);
  const watched = parseInt(stats.total_watched_secs,10);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = percent === 100;

  // ── Streak calculation ────────────────────────
  const { rows: cpRows } = await db.query(
    'SELECT last_activity_date, current_streak_days, longest_streak_days FROM course_progress WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  const existing        = cpRows[0];
  const today           = new Date().toISOString().split('T')[0];
  const lastDate        = existing?.last_activity_date
    ? new Date(existing.last_activity_date).toISOString().split('T')[0]
    : null;
  const yesterday       = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let currentStreak = existing?.current_streak_days || 0;
  let longestStreak = existing?.longest_streak_days || 0;

  if (lastDate !== today) {
    if (lastDate === yesterday) {
      currentStreak += 1;
    } else if (lastDate !== today) {
      currentStreak = 1;  // streak broken — restart
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  // ── Upsert course_progress snapshot ──────────
  const { rows: snapRows } = await db.query(
    `INSERT INTO course_progress
       (user_id, course_id, enrollment_id,
        total_lessons, completed_lessons, percent_complete,
        total_watched_secs, is_completed, completed_at,
        current_streak_days, longest_streak_days, last_activity_date)
     VALUES ($1,$2,$3, $4,$5,$6, $7, $8,
             CASE WHEN $8 THEN NOW() ELSE NULL END,
             $9,$10,$11::date)
     ON CONFLICT (user_id, course_id) DO UPDATE SET
       total_lessons       = $4,
       completed_lessons   = $5,
       percent_complete    = $6,
       total_watched_secs  = $7,
       is_completed        = $8,
       completed_at        = CASE
                               WHEN $8 AND course_progress.completed_at IS NULL
                               THEN NOW()
                               ELSE course_progress.completed_at
                             END,
       current_streak_days = $9,
       longest_streak_days = $10,
       last_activity_date  = $11::date
     RETURNING *`,
    [userId, courseId, enrollmentId,
     total, done, percent, watched, isComplete,
     currentStreak, longestStreak, today]
  );

  // ── Mirror progress into enrollments table ────
  await db.query(
    `UPDATE enrollments
     SET progress_percent   = $1,
         lessons_completed  = $2,
         completed_at       = CASE WHEN $3 AND completed_at IS NULL THEN NOW() ELSE completed_at END
     WHERE user_id = $4 AND course_id = $5`,
    [percent, done, isComplete, userId, courseId]
  );

  // ── Fire course.completed if just hit 100% ────
  if (isComplete && !existing?.is_completed) {
    eventBus.emit('course.completed', { userId, courseId });
  }

  return snapRows[0];
}

// ─────────────────────────────────────────────
//  GET LESSON PROGRESS  (resume position)
//  Called when student opens a lesson —
//  returns exactly where they left off.
// ─────────────────────────────────────────────
async function getLessonProgress(userId, lessonId, courseId) {
  await getEnrollment(userId, courseId);

  const { rows } = await db.query(
    `SELECT watch_position_secs, watched_secs, is_completed,
            completed_at, play_count, last_watched_at
     FROM lesson_progress
     WHERE user_id = $1 AND lesson_id = $2`,
    [userId, lessonId]
  );

  // Return zeros if never watched
  return rows[0] || {
    watch_position_secs: 0,
    watched_secs: 0,
    is_completed: false,
    completed_at: null,
    play_count: 0,
    last_watched_at: null,
  };
}

// ─────────────────────────────────────────────
//  GET COURSE PROGRESS  (full dashboard data)
// ─────────────────────────────────────────────
async function getCourseProgress(userId, courseId) {
  await getEnrollment(userId, courseId);

  // Course-level snapshot
  const { rows: snapRows } = await db.query(
    `SELECT cp.*,
            c.title AS course_title, c.lesson_count, c.duration_seconds
     FROM course_progress cp
     JOIN courses c ON c.id = cp.course_id
     WHERE cp.user_id = $1 AND cp.course_id = $2`,
    [userId, courseId]
  );

  if (!snapRows[0]) {
    return { percent_complete: 0, completed_lessons: 0, total_lessons: 0, lessons: [] };
  }

  // Per-lesson breakdown (for the sidebar checklist)
  const { rows: lessonRows } = await db.query(
    `SELECT
       l.id, l.title, l.type, l.duration_seconds,
       l.sort_order, s.title AS section_title, s.sort_order AS section_order,
       COALESCE(lp.is_completed,        false) AS is_completed,
       COALESCE(lp.watch_position_secs, 0)     AS watch_position_secs,
       COALESCE(lp.watched_secs,        0)     AS watched_secs,
       lp.completed_at,
       lp.last_watched_at
     FROM lessons l
     JOIN sections s ON s.id = l.section_id
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.id AND lp.user_id = $1
     WHERE l.course_id = $2
       AND l.is_published = true
       AND l.deleted_at IS NULL
     ORDER BY s.sort_order, l.sort_order`,
    [userId, courseId]
  );

  // Find the "continue" lesson — first incomplete one
  const nextLesson = lessonRows.find(l => !l.is_completed) || null;

  return {
    ...snapRows[0],
    nextLessonId: nextLesson?.id || null,
    lessons: lessonRows,
  };
}

// ─────────────────────────────────────────────
//  STUDENT DASHBOARD  (all enrolled courses)
//  Returns a lightweight progress card per course.
// ─────────────────────────────────────────────
async function getDashboard(userId) {
  const { rows } = await db.query(
    `SELECT
       e.id            AS enrollment_id,
       e.enrolled_at,
       e.status        AS enrollment_status,
       c.id            AS course_id,
       c.title, c.slug, c.level, c.lesson_count, c.duration_seconds,
       u.first_name || ' ' || u.last_name AS instructor_name,
       f.storage_path  AS thumbnail_path,
       COALESCE(cp.percent_complete,   0)  AS percent_complete,
       COALESCE(cp.completed_lessons,  0)  AS completed_lessons,
       COALESCE(cp.total_watched_secs, 0)  AS total_watched_secs,
       cp.is_completed,
       cp.completed_at,
       cp.current_streak_days,
       cp.last_activity_date,
       -- last lesson the student was watching
       (SELECT lp2.lesson_id FROM lesson_progress lp2
        WHERE lp2.user_id = $1 AND lp2.course_id = c.id
        ORDER BY lp2.last_watched_at DESC LIMIT 1) AS last_lesson_id
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     JOIN users u   ON u.id = c.instructor_id
     LEFT JOIN files f         ON f.id = c.thumbnail_file_id
     LEFT JOIN course_progress cp
       ON cp.user_id = e.user_id AND cp.course_id = e.course_id
     WHERE e.user_id = $1 AND e.status = 'active'
     ORDER BY COALESCE(cp.last_activity_date, e.enrolled_at::date) DESC`,
    [userId]
  );

  // Summary stats across all courses
  const totalCompleted   = rows.filter(r => r.is_completed).length;
  const inProgress       = rows.filter(r => !r.is_completed && r.percent_complete > 0).length;
  const notStarted       = rows.filter(r => r.percent_complete === 0).length;
  const totalWatchedSecs = rows.reduce((a, r) => a + parseInt(r.total_watched_secs, 10), 0);

  return {
    summary: {
      totalEnrolled: rows.length,
      completed:     totalCompleted,
      inProgress,
      notStarted,
      totalWatchedHours: Math.round(totalWatchedSecs / 3600 * 10) / 10,
    },
    courses: rows,
  };
}

// ─────────────────────────────────────────────
//  VIDEO BOOKMARKS
// ─────────────────────────────────────────────
async function addBookmark(userId, lessonId, courseId, positionSecs, label) {
  await getEnrollment(userId, courseId);

  const { rows } = await db.query(
    `INSERT INTO video_bookmarks (user_id, lesson_id, position_secs, label)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, lessonId, positionSecs, label || `Bookmark at ${Math.floor(positionSecs / 60)}:${String(positionSecs % 60).padStart(2, '0')}`]
  );
  return rows[0];
}

async function getBookmarks(userId, lessonId) {
  const { rows } = await db.query(
    `SELECT id, position_secs, label, created_at
     FROM video_bookmarks WHERE user_id = $1 AND lesson_id = $2
     ORDER BY position_secs`,
    [userId, lessonId]
  );
  return rows;
}

async function deleteBookmark(userId, bookmarkId) {
  const { rows } = await db.query(
    `DELETE FROM video_bookmarks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [bookmarkId, userId]
  );
  if (!rows[0]) throw ApiError.notFound('Bookmark not found');
}

// ─────────────────────────────────────────────
//  INSTRUCTOR ANALYTICS — course progress view
// ─────────────────────────────────────────────
async function getCourseAnalytics(courseId, requestingUser) {
  // Verify ownership
  const { rows: courseRows } = await db.query(
    'SELECT id, instructor_id, lesson_count FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = courseRows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && course.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('Access denied');
  }

  // Per-lesson completion rates
  const { rows: lessonStats } = await db.query(
    `SELECT
       l.id, l.title, l.sort_order, l.duration_seconds,
       s.title AS section_title,
       COUNT(lp.id)                                         AS total_starts,
       COUNT(lp.id) FILTER (WHERE lp.is_completed = true)  AS completions,
       ROUND(AVG(lp.watched_secs))                         AS avg_watched_secs,
       CASE WHEN COUNT(lp.id) > 0
            THEN ROUND(COUNT(lp.id) FILTER (WHERE lp.is_completed = true)::numeric
                 / COUNT(lp.id) * 100)
            ELSE 0
       END AS completion_rate_pct
     FROM lessons l
     JOIN sections s ON s.id = l.section_id
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
     WHERE l.course_id = $1 AND l.deleted_at IS NULL AND l.is_published = true
     GROUP BY l.id, l.title, l.sort_order, l.duration_seconds, s.title
     ORDER BY s.sort_order, l.sort_order`,
    [courseId]
  );

  // Course-level summary
  const { rows: summary } = await db.query(
    `SELECT
       COUNT(DISTINCT cp.user_id)                                   AS total_students,
       COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.is_completed)    AS completed_students,
       ROUND(AVG(cp.percent_complete))                              AS avg_progress_pct,
       ROUND(AVG(cp.total_watched_secs) / 3600.0, 1)               AS avg_watched_hours,
       COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.current_streak_days >= 7) AS students_on_streak
     FROM course_progress cp WHERE cp.course_id = $1`,
    [courseId]
  );

  return {
    course:   { id: courseId, lessonCount: course.lesson_count },
    summary:  summary[0],
    lessons:  lessonStats,
  };
}

module.exports = {
  heartbeat,
  markComplete,
  markIncomplete,
  getLessonProgress,
  getCourseProgress,
  getDashboard,
  addBookmark,
  getBookmarks,
  deleteBookmark,
  getCourseAnalytics,
  recomputeCourseProgress,
};