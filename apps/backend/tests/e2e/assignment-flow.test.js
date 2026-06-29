'use strict';

const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

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
  if (!body.success) throw new Error(`Login failed for ${email}: ${body.message}`);
  return body.data.accessToken;
}

async function main() {
  const passed = [];
  const failed = [];

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        passed.push(name);
        console.log(`  ✓ ${name}`);
      } catch (err) {
        failed.push({ name, message: err.message });
        console.log(`  ✗ ${name}: ${err.message}`);
      }
    };
  }

  // ─── SETUP ──────────────────────────────────
  const instructorToken = await login('james@demo.lms', 'Teach@123');
  const studentToken    = await login('alice@demo.lms', 'Learn@123');
  const COURSE_SLUG     = 'javascript-mastery';
  const COURSE_ID       = 'c3000000-0000-0000-0000-000000000001';

  // Get a section from the course
  const courseRes = await api(`/api/v1/courses/${COURSE_SLUG}`, {
    headers: { Authorization: `Bearer ${instructorToken}` },
  });
  const course = courseRes.body.data.course;
  const section = course.sections[0];

  // ─── TEST 1: Create a lesson of type 'assignment' ──
  const test1 = test('Create assignment lesson', async () => {
    const { body } = await api(`/api/v1/courses/${COURSE_ID}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${instructorToken}` },
      body: JSON.stringify({
        title: `E2E Assignment Lesson ${Date.now()}`,
        type: 'assignment',
        sectionId: section.id,
      }),
    });
    assert.ok(body.success, 'Lesson creation should succeed');
    assert.strictEqual(body.data.lesson.type, 'assignment');
    global.lessonId = body.data.lesson.id;
  });

  // ─── TEST 2: Create an assignment (published by default) ──
  const test2 = test('Create assignment (published by default)', async () => {
    assert.ok(global.lessonId, 'Lesson must exist');
    const { body } = await api('/api/v1/submissions/assignments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${instructorToken}` },
      body: JSON.stringify({
        lessonId: global.lessonId,
        courseId: COURSE_ID,
        title: 'E2E Test Assignment',
        instructions: 'This is an E2E test assignment',
        maxScore: 100,
        passingScore: 60,
      }),
    });
    assert.ok(body.success, 'Assignment creation should succeed');
    assert.strictEqual(body.data.assignment.is_published, true,
      'New assignments should be published by default');
    assert.strictEqual(body.data.assignment.title, 'E2E Test Assignment');
    global.assignmentId = body.data.assignment.id;
  });

  // ─── TEST 3: Student can view the assignment (was the original bug) ──
  const test3 = test('Student can view the assignment', async () => {
    assert.ok(global.lessonId, 'Lesson must exist');
    const { body } = await api(
      `/api/v1/submissions/assignments/by-lesson/${global.lessonId}`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.ok(body.success, 'Student should see the assignment');
    assert.ok(body.data.assignment, 'Assignment data should be present');
    assert.strictEqual(body.data.assignment.is_published, true,
      'Assignment must be published for student to see it');
  });

  // ─── TEST 4: Student received notification about the new assignment ──
  const test4 = test('Student receives notification for new assignment', async () => {
    // Check for the most recent notification
    const { body } = await api('/api/v1/notifications', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const notifs = Array.isArray(body.data) ? body.data : [];

    const match = notifs.find(n =>
      n.type === 'assignment_available'
    );

    assert.ok(match, 'Should have an assignment_available notification');
    assert.ok(match.title.includes('New Assignment'),
      `Expected title containing 'New Assignment', got "${match.title}"`);
    assert.ok(match.body.includes('E2E Test Assignment'),
      `Notification body should reference the assignment title`);
  });

  // ─── TEST 5: Instructor cannot see assignment as 'not found' ──
  const test5 = test('Instructor also sees the assignment', async () => {
    assert.ok(global.lessonId);
    const { body } = await api(
      `/api/v1/submissions/assignments/by-lesson/${global.lessonId}`,
      { headers: { Authorization: `Bearer ${instructorToken}` } }
    );
    assert.ok(body.success, 'Instructor should see the assignment');
    assert.strictEqual(body.data.assignment.is_published, true);
  });

  // ─── RUN ─────────────────────────────────────
  const tests = [test1, test2, test3, test4, test5];

  console.log('\n  Assignment E2E Tests\n');
  for (const t of tests) {
    await t();
  }

  console.log(`\n  Results: ${passed.length}/${tests.length} passed`);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.map(f => f.name).join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
