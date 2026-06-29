'use strict';

const assert = require('assert');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

const DB = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'lms_test',
  user: process.env.POSTGRES_USER || 'lms_user',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
};

const ADMIN = {
  email: 'shaheedmahmoudacademy@gmail.com',
  password: 'SMAbr0!h@rs2026',
  firstName: 'Super',
  lastName: 'Admin',
};

const INSTRUCTOR = {
  email: 'e2e.instructor@test.lms',
  password: 'Test@123',
  firstName: 'E2E',
  lastName: 'Instructor',
};

const STUDENT = {
  email: 'e2e.student@test.lms',
  password: 'Test@123',
  firstName: 'E2E',
  lastName: 'Student',
};

const passed = [];
const failed = [];

function test(name, fn) {
  return async () => {
    try {
      await fn();
      passed.push(name);
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed.push({ name, message: err.message });
      console.log(`  \u2717 ${name}: ${err.message}`);
    }
  };
}

async function api(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text), headers: res.headers };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

async function login(email, password) {
  const { body } = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!body.success) throw new Error(`Login failed: ${body.message}`);
  return body.data;
}

async function main() {
  console.log('\n\x1b[1m=== LMS Comprehensive E2E Tests ===\x1b[0m\n');

  // ─── SETUP: Truncate DB + Seed users ────────────
  const setupTest = test('Database setup — truncate + seed', async () => {
    const pool = new Pool(DB);
    const salt = await bcrypt.genSalt(12);

    try {
      await pool.query(`
        DO $$ DECLARE
          tbl TEXT;
        BEGIN
          FOR tbl IN
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename NOT IN ('spatial_ref_sys')
          LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(tbl) || ' CASCADE';
          END LOOP;
        END $$;
      `);

      const adminHash = await bcrypt.hash(ADMIN.password, salt);
      const instructorHash = await bcrypt.hash(INSTRUCTOR.password, salt);
      const studentHash = await bcrypt.hash(STUDENT.password, salt);

      const adminRes = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
         VALUES ($1, $2, $3, $4, 'super_admin', 'active', NOW())
         RETURNING id`,
        [ADMIN.email, adminHash, ADMIN.firstName, ADMIN.lastName]
      );
      global.adminId = adminRes.rows[0].id;

      const instructorRes = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
         VALUES ($1, $2, $3, $4, 'instructor', 'active', NOW())
         RETURNING id`,
        [INSTRUCTOR.email, instructorHash, INSTRUCTOR.firstName, INSTRUCTOR.lastName]
      );
      global.instructorId = instructorRes.rows[0].id;

      const studentRes = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
         VALUES ($1, $2, $3, $4, 'student', 'active', NOW())
         RETURNING id`,
        [STUDENT.email, studentHash, STUDENT.firstName, STUDENT.lastName]
      );
      global.studentId = studentRes.rows[0].id;

      // Seed default categories
      await pool.query(`
        INSERT INTO categories (name, slug, description, sort_order) VALUES
          ('Technology', 'technology', 'Software, hardware and IT courses', 1),
          ('Mathematics', 'mathematics', 'Calculus, statistics and applied math', 2)
        ON CONFLICT (slug) DO NOTHING
      `);

      // Seed default badges
      await pool.query(`
        INSERT INTO badges (name, description, icon, badge_type) VALUES
          ('First Steps', 'Complete your first lesson', 'play', 'first_lesson'),
          ('Course Graduate', 'Complete an entire course', 'graduation', 'course_complete'),
          ('Perfect Score', 'Get 100% on a quiz', 'check', 'quiz_perfect')
        ON CONFLICT DO NOTHING
      `);

      console.log('      Users seeded: admin, instructor, student');
      console.log('      Default categories and badges seeded');
    } finally {
      await pool.end();
    }
  });

  await setupTest();

  // ─── LOGIN: All three users ─────────────────────
  let adminToken, instructorToken, studentToken;
  let adminRefreshToken;
  let courseId, sectionId, lessonId, quizId, questionId, attemptId;
  let assignmentId, submissionId, forumThreadId;

  const t = {};

  t['Auth - Admin login'] = test('Auth - Admin login', async () => {
    const data = await login(ADMIN.email, ADMIN.password);
    assert.ok(data.accessToken);
    assert.ok(data.refreshToken);
    assert.strictEqual(data.user.email, ADMIN.email);
    assert.strictEqual(data.user.role, 'super_admin');
    adminToken = data.accessToken;
    adminRefreshToken = data.refreshToken;
  });

  t['Auth - Instructor login'] = test('Auth - Instructor login', async () => {
    const data = await login(INSTRUCTOR.email, INSTRUCTOR.password);
    assert.ok(data.accessToken);
    instructorToken = data.accessToken;
    assert.strictEqual(data.user.role, 'instructor');
  });

  t['Auth - Student login'] = test('Auth - Student login', async () => {
    const data = await login(STUDENT.email, STUDENT.password);
    assert.ok(data.accessToken);
    studentToken = data.accessToken;
    assert.strictEqual(data.user.role, 'student');
  });

  t['Auth - Get /me'] = test('Auth - Get /me', async () => {
    const { body } = await api('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.email, ADMIN.email);
  });

  t['Auth - Refresh token'] = test('Auth - Refresh token', async () => {
    const { body } = await api('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    adminToken = body.data.accessToken;
    adminRefreshToken = body.data.refreshToken;
  });

  // ─── HEALTH ─────────────────────────────────────
  t['Health endpoint'] = test('Health endpoint', async () => {
    const { body } = await api('/api/health');
    assert.ok(body.status === 'ok' || body.status === 'healthy');
    assert.ok(body.services);
  });

  // ─── ADMIN: User Management ─────────────────────
  t['Admin - List users'] = test('Admin - List users', async () => {
    const { body } = await api('/api/v1/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.users));
    assert.ok(body.data.users.length >= 3);
  });

  t['Admin - Create new user'] = test('Admin - Create new user', async () => {
    const { body } = await api('/api/v1/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: `newuser${Date.now()}@test.lms`,
        password: 'Pass@123',
        firstName: 'New',
        lastName: 'User',
        role: 'student',
      }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.user.role, 'student');
    global.tempUserId = body.data.user.id;
  });

  t['Admin - Update user role'] = test('Admin - Update user role', async () => {
    assert.ok(global.tempUserId);
    const { body } = await api(`/api/v1/users/${global.tempUserId}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ role: 'instructor' }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.user.role, 'instructor');
  });

  t['Admin - Update user status'] = test('Admin - Update user status', async () => {
    assert.ok(global.tempUserId);
    const { body } = await api(`/api/v1/users/${global.tempUserId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'suspended' }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.user.status, 'suspended');
  });

  t['Admin - Delete user'] = test('Admin - Delete user', async () => {
    assert.ok(global.tempUserId);
    const { body } = await api(`/api/v1/users/${global.tempUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
  });

  t['Admin - Analytics'] = test('Admin - Analytics', async () => {
    const { body } = await api('/api/v1/admin/analytics', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
  });

  t['Admin - Settings'] = test('Admin - Settings (public, no auth)', async () => {
    const { body } = await api('/api/v1/admin/settings');
    assert.ok(body.success);
  });

  // ─── CATEGORIES ─────────────────────────────────
  t['Categories - List'] = test('Categories - List', async () => {
    const { body } = await api('/api/v1/courses/categories');
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2);
    const tech = body.data.find(c => c.slug === 'technology');
    assert.ok(tech);
  });

  // ─── COURSES ────────────────────────────────────
  const courseSlug = `e2e-test-course-${Date.now()}`;

  t['Courses - Create'] = test('Courses - Create', async () => {
    const { body } = await api('/api/v1/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'E2E Test Course',
        slug: courseSlug,
        description: 'A comprehensive E2E test course',
        shortDescription: 'Short desc for E2E',
        categoryId: null,
        isFree: true,
        level: 'beginner',
        language: 'English',
      }),
    });
    assert.ok(body.success);
    assert.ok(body.data.course);
    assert.strictEqual(body.data.course.title, 'E2E Test Course');
    courseId = body.data.course.id;
    global.courseSlug = courseSlug;
  });

  t['Courses - List'] = test('Courses - List (public)', async () => {
    const { body } = await api('/api/v1/courses');
    assert.ok(body.success);
    const found = body.data.courses.find(c => c.id === courseId);
    assert.ok(found);
  });

  t['Courses - Get by slug'] = test('Courses - Get by slug', async () => {
    const { body } = await api(`/api/v1/courses/${courseSlug}`);
    assert.ok(body.success);
    assert.strictEqual(body.data.course.id, courseId);
  });

  t['Courses - Update'] = test('Courses - Update', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ shortDescription: 'Updated short desc' }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.course.shortDescription, 'Updated short desc');
  });

  t['Courses - Publish'] = test('Courses - Publish', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.course.status, 'published');
  });

  // ─── SECTIONS ───────────────────────────────────
  t['Sections - Create'] = test('Sections - Create', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/sections`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'Introduction', description: 'Getting started' }),
    });
    assert.ok(body.success);
    sectionId = body.data.section.id;
    assert.strictEqual(body.data.section.title, 'Introduction');
  });

  t['Sections - Update'] = test('Sections - Update', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/sections/${sectionId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'Introduction Updated' }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.section.title, 'Introduction Updated');
  });

  // ─── LESSONS ────────────────────────────────────
  t['Lessons - Create (video)'] = test('Lessons - Create (video)', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Welcome Video',
        type: 'video',
        sectionId,
        content: 'https://example.com/video.mp4',
        isFreePreview: true,
      }),
    });
    assert.ok(body.success);
    lessonId = body.data.lesson.id;
    assert.strictEqual(body.data.lesson.title, 'Welcome Video');
    assert.strictEqual(body.data.lesson.type, 'video');
  });

  t['Lessons - Create (text)'] = test('Lessons - Create (text)', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Reading Material',
        type: 'text',
        sectionId,
        content: '# Hello\nThis is markdown content.',
      }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.lesson.type, 'text');
  });

  t['Lessons - Get'] = test('Lessons - Get (authenticated)', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons/${lessonId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.lesson.id, lessonId);
  });

  t['Lessons - Update'] = test('Lessons - Update', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'Welcome Video Updated' }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.lesson.title, 'Welcome Video Updated');
  });

  // ─── ENROLLMENTS ────────────────────────────────
  t['Enrollments - Manual enroll (admin)'] = test('Enrollments - Manual enroll', async () => {
    const { body } = await api('/api/v1/enrollments/manual', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userId: global.studentId, courseId }),
    });
    assert.ok(body.success);
    global.enrollmentId = body.data.enrollment.id;
  });

  t['Enrollments - Student view my enrollments'] = test('Enrollments - My enrollments (student)', async () => {
    const { body } = await api('/api/v1/enrollments/my', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    const found = body.data.enrollments.find(e => e.course_id === courseId);
    assert.ok(found, 'Student should see enrollment');
  });

  t['Enrollments - List course enrollments (admin)'] = test('Enrollments - Course enrollments', async () => {
    const { body } = await api(`/api/v1/enrollments/course/${courseId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.enrollments));
  });

  // ─── PROGRESS ───────────────────────────────────
  t['Progress - Mark lesson complete'] = test('Progress - Mark lesson complete', async () => {
    const { body } = await api(`/api/v1/progress/lessons/${lessonId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ courseId }),
    });
    assert.ok(body.success);
  });

  t['Progress - Course progress'] = test('Progress - Course progress', async () => {
    const { body } = await api(`/api/v1/progress/courses/${courseId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(body.data.progress.completedLessons >= 1);
  });

  t['Progress - Dashboard'] = test('Progress - Dashboard', async () => {
    const { body } = await api('/api/v1/progress/dashboard', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  // ─── QUIZZES ────────────────────────────────────
  let quizLessonId;

  t['Quizzes - Create quiz lesson'] = test('Quizzes - Create quiz lesson', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Knowledge Check',
        type: 'quiz',
        sectionId,
      }),
    });
    assert.ok(body.success);
    quizLessonId = body.data.lesson.id;
    assert.strictEqual(body.data.lesson.type, 'quiz');
  });

  t['Quizzes - Create quiz'] = test('Quizzes - Create quiz', async () => {
    assert.ok(quizLessonId);
    const { body } = await api('/api/v1/assessments/quizzes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        lessonId: quizLessonId,
        courseId,
        title: 'E2E Quiz',
        description: 'Test your knowledge',
        maxAttempts: 2,
        passingScorePct: 50,
        shuffleQuestions: false,
        showAnswersAfter: true,
      }),
    });
    assert.ok(body.success);
    quizId = body.data.quiz.id;
  });

  t['Quizzes - Add question'] = test('Quizzes - Add question (MCQ)', async () => {
    assert.ok(quizId);
    const { body } = await api(`/api/v1/assessments/quizzes/${quizId}/questions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        type: 'multiple_choice',
        questionText: 'What is 2+2?',
        options: [
          { id: 'a', text: '3', isCorrect: false },
          { id: 'b', text: '4', isCorrect: true },
          { id: 'c', text: '5', isCorrect: false },
          { id: 'd', text: '6', isCorrect: false },
        ],
        points: 1,
        explanation: 'Basic math',
      }),
    });
    assert.ok(body.success);
    questionId = body.data.question.id;
  });

  t['Quizzes - Publish quiz'] = test('Quizzes - Publish quiz', async () => {
    assert.ok(quizId);
    const { body } = await api(`/api/v1/assessments/quizzes/${quizId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isPublished: true }),
    });
    assert.ok(body.success);
    assert.strictEqual(body.data.quiz.is_published, true);
  });

  t['Quizzes - Start attempt'] = test('Quizzes - Start attempt (student)', async () => {
    assert.ok(quizId);
    const { body } = await api(`/api/v1/assessments/quizzes/${quizId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    attemptId = body.data.attempt.id;
    assert.strictEqual(body.data.attempt.status, 'in_progress');
  });

  t['Quizzes - Submit attempt'] = test('Quizzes - Submit attempt', async () => {
    assert.ok(attemptId);
    assert.ok(questionId);
    const { body } = await api(`/api/v1/assessments/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: [{ questionId, selectedOptions: ['b'] }],
      }),
    });
    assert.ok(body.success);
    assert.ok(body.data.result.score !== undefined);
  });

  t['Quizzes - Get result'] = test('Quizzes - Get attempt result', async () => {
    assert.ok(attemptId);
    const { body } = await api(`/api/v1/assessments/attempts/${attemptId}/result`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(body.data.attempt);
  });

  t['Quizzes - Student view quiz by lesson'] = test('Quizzes - View quiz by lesson', async () => {
    assert.ok(quizLessonId);
    const { body } = await api(`/api/v1/assessments/quizzes/by-lesson/${quizLessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(body.data.quiz);
  });

  // ─── ASSIGNMENTS ────────────────────────────────
  let assignmentLessonId;

  t['Assignments - Create assignment lesson'] = test('Assignments - Create assignment lesson', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Final Project',
        type: 'assignment',
        sectionId,
      }),
    });
    assert.ok(body.success);
    assignmentLessonId = body.data.lesson.id;
  });

  t['Assignments - Create assignment'] = test('Assignments - Create assignment', async () => {
    assert.ok(assignmentLessonId);
    const { body } = await api('/api/v1/submissions/assignments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        lessonId: assignmentLessonId,
        courseId,
        title: 'E2E Final Project',
        instructions: 'Build something amazing',
        maxScore: 100,
        passingScore: 60,
      }),
    });
    assert.ok(body.success);
    assignmentId = body.data.assignment.id;
  });

  t['Assignments - View by lesson (student)'] = test('Assignments - View by lesson', async () => {
    assert.ok(assignmentLessonId);
    const { body } = await api(`/api/v1/submissions/assignments/by-lesson/${assignmentLessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  t['Assignments - Submit (text)'] = test('Assignments - Submit (text)', async () => {
    assert.ok(assignmentId);
    const { body } = await api(`/api/v1/submissions/assignments/${assignmentId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        textContent: 'This is my E2E project submission.',
      }),
    });
    assert.ok(body.success);
    submissionId = body.data.submission.id;
  });

  t['Assignments - Grade submission'] = test('Assignments - Grade submission', async () => {
    assert.ok(submissionId);
    const { body } = await api(`/api/v1/submissions/submissions/${submissionId}/grade`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        score: 85,
        feedback: 'Great work!',
      }),
    });
    assert.ok(body.success);
    assert.strictEqual(Number(body.data.submission.score), 85);
  });

  t['Assignments - Gradebook'] = test('Assignments - Gradebook', async () => {
    const { body } = await api(`/api/v1/submissions/gradebook/${courseId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  // ─── MESSAGES ───────────────────────────────────
  t['Messages - Send'] = test('Messages - Send DM', async () => {
    const { body } = await api('/api/v1/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        recipientId: global.studentId,
        content: 'Welcome to the course!',
      }),
    });
    assert.ok(body.success);
    global.conversationId = body.data.conversationId;
  });

  t['Messages - List conversations'] = test('Messages - List conversations (student)', async () => {
    const { body } = await api('/api/v1/messages', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.conversations));
  });

  t['Messages - Get messages in conversation'] = test('Messages - Get conversation messages', async () => {
    assert.ok(global.conversationId);
    const { body } = await api(`/api/v1/messages/${global.conversationId}/messages`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.messages));
  });

  t['Messages - List contacts'] = test('Messages - List contacts', async () => {
    const { body } = await api('/api/v1/messages/contacts', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.contacts));
  });

  // ─── NOTIFICATIONS ──────────────────────────────
  t['Notifications - List'] = test('Notifications - List (student)', async () => {
    const { body } = await api('/api/v1/notifications', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
  });

  t['Notifications - Unread count'] = test('Notifications - Unread count', async () => {
    const { body } = await api('/api/v1/notifications/unread-count', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(typeof body.data.count === 'number');
  });

  t['Notifications - Mark read'] = test('Notifications - Mark all as read', async () => {
    const { body } = await api('/api/v1/notifications/read', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({}),
    });
    assert.ok(body.success);
  });

  t['Notifications - Preferences'] = test('Notifications - Get preferences', async () => {
    const { body } = await api('/api/v1/notifications/preferences', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  // ─── FORUMS ─────────────────────────────────────
  t['Forums - Create thread'] = test('Forums - Create thread (student)', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/forums`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        title: 'Question about E2E',
        content: 'How do I run the tests?',
      }),
    });
    assert.ok(body.success);
    forumThreadId = body.data.thread.id;
  });

  t['Forums - List threads'] = test('Forums - List threads', async () => {
    const { body } = await api(`/api/v1/courses/${courseId}/forums`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.threads));
  });

  t['Forums - Get thread'] = test('Forums - Get thread', async () => {
    assert.ok(forumThreadId);
    const { body } = await api(`/api/v1/courses/${courseId}/forums/${forumThreadId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(body.success);
  });

  t['Forums - Create reply'] = test('Forums - Create reply (admin)', async () => {
    assert.ok(forumThreadId);
    const { body } = await api(`/api/v1/courses/${courseId}/forums/${forumThreadId}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: 'Great question! Here is the answer.' }),
    });
    assert.ok(body.success);
  });

  t['Forums - List posts'] = test('Forums - List posts in thread', async () => {
    assert.ok(forumThreadId);
    const { body } = await api(`/api/v1/courses/${courseId}/forums/${forumThreadId}/posts`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.posts));
  });

  // ─── CERTIFICATES / XP ──────────────────────────
  t['Certificates - List certificates'] = test('Certificates - List', async () => {
    const { body } = await api('/api/v1/certificates', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  t['XP - Leaderboard'] = test('XP - Leaderboard', async () => {
    const { body } = await api('/api/v1/certificates/leaderboard', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  t['XP - My XP'] = test('XP - My XP', async () => {
    const { body } = await api('/api/v1/certificates/my-xp', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.ok(body.success);
  });

  // ─── AUTH LOGOUT ────────────────────────────────
  t['Auth - Logout'] = test('Auth - Logout', async () => {
    const { body } = await api('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });
    assert.ok(body.success);
  });

  // ─── UNAUTHORIZED ACCESS ────────────────────────
  t['Security - Unauthorized access rejected'] = test('Security - No token = 401', async () => {
    const { status } = await api('/api/v1/users', { method: 'GET' });
    assert.ok(status === 401 || status === 403);
  });

  // ─── RUN ALL TESTS ──────────────────────────────
  const testNames = Object.keys(t);
  console.log(`\n\x1b[1mRunning ${testNames.length} tests...\x1b[0m\n`);

  for (const name of testNames) {
    await t[name]();
  }

  console.log(`\n\x1b[1mResults: ${passed.length}/${testNames.length} passed\x1b[0m`);
  if (failed.length > 0) {
    console.log(`\x1b[31mFailed: ${failed.map(f => f.name).join(', ')}\x1b[0m`);
    process.exit(1);
  }
  console.log('\x1b[32mAll tests passed!\x1b[0m\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
