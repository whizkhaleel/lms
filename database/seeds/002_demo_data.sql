-- ─────────────────────────────────────────────
--  Demo Data Seed
--  Run: docker exec -i lms_backend node database/seed-demo.js
--  Or:  docker compose exec -T postgres psql -U lms_user -d lms < database/seeds/002_demo_data.sql
-- ─────────────────────────────────────────────

-- ── Instructors ──────────────────────────────
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified_at, headline, bio) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'james@demo.lms',
   '$2a$12$QOPD/Jz5FlIYE6C129lvTewdINKimP/YFzuMQcO93sbvolpLjWLMG',
   'James', 'Wilson', 'instructor', 'active', NOW(),
   'Senior Software Engineer & Educator',
   'Full-stack developer with 10+ years teaching JavaScript, Python, and cloud architecture.')
  ,
  ('a1000000-0000-0000-0000-000000000002', 'sarah@demo.lms',
   '$2a$12$QOPD/Jz5FlIYE6C129lvTewdINKimP/YFzuMQcO93sbvolpLjWLMG',
   'Sarah', 'Chen', 'instructor', 'active', NOW(),
   'Data Scientist & AI Researcher',
   'PhD in Machine Learning. I make complex AI concepts accessible to everyone.')
  ,
  ('a1000000-0000-0000-0000-000000000003', 'marcus@demo.lms',
   '$2a$12$QOPD/Jz5FlIYE6C129lvTewdINKimP/YFzuMQcO93sbvolpLjWLMG',
   'Marcus', 'Okafor', 'instructor', 'active', NOW(),
   'Business Strategist & Entrepreneurship Coach',
   'Helping aspiring entrepreneurs build and scale their businesses since 2015.')
ON CONFLICT (email) DO NOTHING;

-- ── Students ─────────────────────────────────
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified_at) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'alice@demo.lms',
   '$2a$12$Rey8NTXjJRRSa1ucIgQ5hOaVtI2WYHPLLkvDrmruKpn1DnkyXodli',
   'Alice', 'Johnson', 'student', 'active', NOW()),
  ('b2000000-0000-0000-0000-000000000002', 'bob@demo.lms',
   '$2a$12$Rey8NTXjJRRSa1ucIgQ5hOaVtI2WYHPLLkvDrmruKpn1DnkyXodli',
   'Bob', 'Martinez', 'student', 'active', NOW()),
  ('b2000000-0000-0000-0000-000000000003', 'chiara@demo.lms',
   '$2a$12$Rey8NTXjJRRSa1ucIgQ5hOaVtI2WYHPLLkvDrmruKpn1DnkyXodli',
   'Chiara', 'Okonkwo', 'student', 'active', NOW()),
  ('b2000000-0000-0000-0000-000000000004', 'david@demo.lms',
   '$2a$12$Rey8NTXjJRRSa1ucIgQ5hOaVtI2WYHPLLkvDrmruKpn1DnkyXodli',
   'David', 'Kim', 'student', 'active', NOW()),
  ('b2000000-0000-0000-0000-000000000005', 'emma@demo.lms',
   '$2a$12$Rey8NTXjJRRSa1ucIgQ5hOaVtI2WYHPLLkvDrmruKpn1DnkyXodli',
   'Emma', 'Davies', 'student', 'active', NOW())
ON CONFLICT (email) DO NOTHING;

-- ── Courses ──────────────────────────────────
INSERT INTO courses (id, title, slug, description, short_description, status, instructor_id, category_id, level, language, tags, objectives, duration_seconds, lesson_count, published_at)
VALUES
  ('c3000000-0000-0000-0000-000000000001',
   'JavaScript Mastery: From Zero to Hero',
   'javascript-mastery',
   'A comprehensive journey through modern JavaScript. Covers ES6+, async/await, closures, the event loop, modules, and real-world projects. By the end you will build a full-stack web application.',
   'Master modern JavaScript with hands-on projects',
   'published',
   'a1000000-0000-0000-0000-000000000001',
   (SELECT id FROM categories WHERE slug = 'technology'),
   'intermediate', 'English',
   ARRAY['javascript','web-development','node.js','react'],
   ARRAY['Build a full-stack app from scratch','Understand closures and the event loop','Master async/await and promises','Write clean, maintainable code'],
   28800, 24, NOW() - INTERVAL '30 days'),
  ('c3000000-0000-0000-0000-000000000002',
   'Python for Data Science & Machine Learning',
   'python-data-science',
   'Learn Python programming with a focus on data analysis, visualization, and machine learning. Use pandas, numpy, matplotlib, and scikit-learn on real datasets.',
   'Your gateway to data science with Python',
   'published',
   'a1000000-0000-0000-0000-000000000002',
   (SELECT id FROM categories WHERE slug = 'science'),
   'beginner', 'English',
   ARRAY['python','data-science','machine-learning','pandas'],
   ARRAY['Analyze real-world datasets with pandas','Build and evaluate ML models','Create compelling data visualizations','Understand statistical concepts'],
   36000, 30, NOW() - INTERVAL '20 days'),
  ('c3000000-0000-0000-0000-000000000003',
   'Entrepreneurship 101: Start Your Business',
   'entrepreneurship-101',
   'From idea to launch — learn how to validate your business idea, create a business plan, register your company, manage finances, and market your product.',
   'Turn your business idea into reality',
   'published',
   'a1000000-0000-0000-0000-000000000003',
   (SELECT id FROM categories WHERE slug = 'business'),
   'beginner', 'English',
   ARRAY['entrepreneurship','business-plan','marketing','finance'],
   ARRAY['Validate your business idea','Write a professional business plan','Understand startup finances','Launch and market your product'],
   21600, 18, NOW() - INTERVAL '15 days')
ON CONFLICT (slug) DO NOTHING;

-- ── Sections ─────────────────────────────────
INSERT INTO sections (id, course_id, title, description, sort_order) VALUES
  -- Course 1: JavaScript
  ('d4000000-0000-0000-0001-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Getting Started', 'Environment setup and first steps', 1),
  ('d4000000-0000-0000-0001-000000000002', 'c3000000-0000-0000-0000-000000000001', 'Variables & Data Types', 'Understanding the building blocks', 2),
  ('d4000000-0000-0000-0001-000000000003', 'c3000000-0000-0000-0000-000000000001', 'Functions & Scope', 'Deep dive into functions', 3),
  ('d4000000-0000-0000-0001-000000000004', 'c3000000-0000-0000-0000-000000000001', 'DOM Manipulation', 'Working with the browser', 4),
  -- Course 2: Python Data Science
  ('d4000000-0000-0000-0002-000000000001', 'c3000000-0000-0000-0000-000000000002', 'Python Basics Refresher', 'Quick review of Python fundamentals', 1),
  ('d4000000-0000-0000-0002-000000000002', 'c3000000-0000-0000-0000-000000000002', 'NumPy & Pandas', 'Data manipulation essentials', 2),
  ('d4000000-0000-0000-0002-000000000003', 'c3000000-0000-0000-0000-000000000002', 'Data Visualization', 'Creating impactful charts', 3),
  ('d4000000-0000-0000-0002-000000000004', 'c3000000-0000-0000-0000-000000000002', 'Machine Learning Basics', 'Your first ML models', 4),
  -- Course 3: Entrepreneurship
  ('d4000000-0000-0000-0003-000000000001', 'c3000000-0000-0000-0000-000000000003', 'Finding Your Idea', 'Identifying problems worth solving', 1),
  ('d4000000-0000-0000-0003-000000000002', 'c3000000-0000-0000-0000-000000000003', 'Business Planning', 'Writing a lean business plan', 2),
  ('d4000000-0000-0000-0003-000000000003', 'c3000000-0000-0000-0000-000000000003', 'Marketing & Sales', 'Getting your first customers', 3)
ON CONFLICT DO NOTHING;

-- ── Lessons ──────────────────────────────────
INSERT INTO lessons (id, section_id, course_id, title, type, content, duration_seconds, sort_order, is_published) VALUES
  -- Course 1 / Section 1: Getting Started
  ('e5000000-0001-0000-0000-000000000001', 'd4000000-0000-0000-0001-000000000001', 'c3000000-0000-0000-0000-000000000001',
   'Welcome & Course Overview', 'video', 'Introduction to the course structure, what you will learn, and how to get the most out of this journey.', 480, 1, true, true),
  ('e5000000-0001-0000-0000-000000000002', 'd4000000-0000-0000-0001-000000000001', 'c3000000-0000-0000-0000-000000000001',
   'Installing Node.js & VS Code', 'video', 'Step-by-step guide to setting up your development environment.', 720, 2, true, true),
  ('e5000000-0001-0000-0000-000000000003', 'd4000000-0000-0000-0001-000000000001', 'c3000000-0000-0000-0000-000000000001',
   'Your First JavaScript Program', 'video', 'Write and run your first JavaScript program. Hello, World!', 360, 3, false, true),
  -- Course 1 / Section 2: Variables & Data Types
  ('e5000000-0002-0000-0000-000000000001', 'd4000000-0000-0000-0001-000000000002', 'c3000000-0000-0000-0000-000000000001',
   'Variables: let, const, and var', 'video', 'Understanding variable declarations and when to use each.', 900, 1, false, true),
  ('e5000000-0002-0000-0000-000000000002', 'd4000000-0000-0000-0001-000000000002', 'c3000000-0000-0000-0000-000000000001',
   'Strings, Numbers & Booleans', 'video', 'Working with primitive data types in JavaScript.', 720, 2, false, true),
  ('e5000000-0002-0000-0000-000000000003', 'd4000000-0000-0000-0001-000000000002', 'c3000000-0000-0000-0000-000000000001',
   'Arrays & Objects', 'video', 'Understanding collections and complex data structures.', 1080, 3, false, true),
  -- Course 1 / Section 3: Functions & Scope
  ('e5000000-0003-0000-0000-000000000001', 'd4000000-0000-0000-0001-000000000003', 'c3000000-0000-0000-0000-000000000001',
   'Function Declarations vs Expressions', 'video', 'Learn the difference between function types.', 600, 1, false, true),
  ('e5000000-0003-0000-0000-000000000002', 'd4000000-0000-0000-0001-000000000003', 'c3000000-0000-0000-0000-000000000001',
   'Arrow Functions & This Keyword', 'video', 'Modern arrow functions and how "this" binding works.', 840, 2, false, true),
  -- Course 2 / Section 1: Python Basics Refresher
  ('e5000000-0004-0000-0000-000000000001', 'd4000000-0000-0000-0002-000000000001', 'c3000000-0000-0000-0000-000000000002',
   'Python Environment Setup', 'video', 'Install Python, set up a virtual environment, and choose an IDE.', 540, 1, true, true),
  ('e5000000-0004-0000-0000-000000000002', 'd4000000-0000-0000-0002-000000000001', 'c3000000-0000-0000-0000-000000000002',
   'Python Data Structures Review', 'video', 'Lists, tuples, dicts, and sets — a quick refresher.', 960, 2, false, true),
  -- Course 2 / Section 2: NumPy & Pandas
  ('e5000000-0005-0000-0000-000000000001', 'd4000000-0000-0000-0002-000000000002', 'c3000000-0000-0000-0000-000000000002',
   'Introduction to NumPy Arrays', 'video', 'Create and manipulate multidimensional arrays with NumPy.', 1200, 1, false, true),
  ('e5000000-0005-0000-0000-000000000002', 'd4000000-0000-0000-0002-000000000002', 'c3000000-0000-0000-0000-000000000002',
   'Pandas Series & DataFrames', 'video', 'The core data structures of pandas for data analysis.', 1500, 2, false, true),
  -- Course 3 / Section 1: Finding Your Idea
  ('e5000000-0006-0000-0000-000000000001', 'd4000000-0000-0000-0003-000000000001', 'c3000000-0000-0000-0000-000000000003',
   'The Entrepreneurial Mindset', 'video', 'Cultivating the mindset needed to identify and pursue opportunities.', 600, 1, true, true),
  ('e5000000-0006-0000-0000-000000000002', 'd4000000-0000-0000-0003-000000000001', 'c3000000-0000-0000-0000-000000000003',
   'Problem Validation Techniques', 'video', 'How to validate that a problem is worth solving before building a solution.', 900, 2, true, true),
  -- Course 3 / Section 2: Business Planning
  ('e5000000-0007-0000-0000-000000000001', 'd4000000-0000-0000-0003-000000000002', 'c3000000-0000-0000-0000-000000000003',
   'Lean Business Model Canvas', 'video', 'Map out your business model on a single page.', 780, 1, false, true),
  ('e5000000-0007-0000-0000-000000000002', 'd4000000-0000-0000-0003-000000000002', 'c3000000-0000-0000-0000-000000000003',
   'Financial Projections for Startups', 'video', 'Build realistic financial projections for your new venture.', 1080, 2, false, true)
ON CONFLICT DO NOTHING;

-- ── Enrollments (with progress callbacks triggering automatically) ──
INSERT INTO enrollments (user_id, course_id, status, enrolled_at) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '14 days'),
  ('b2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'active', NOW() - INTERVAL '7 days'),
  ('b2000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '10 days'),
  ('b2000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000003', 'active', NOW() - INTERVAL '3 days'),
  ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000002', 'active', NOW() - INTERVAL '12 days'),
  ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003', 'active', NOW() - INTERVAL '5 days'),
  ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '2 days'),
  ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '20 days'),
  ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000003', 'active', NOW() - INTERVAL '1 day'),
  ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '8 days')
ON CONFLICT (user_id, course_id) DO NOTHING;

-- ── Lesson Progress (mark some lessons as completed) ──
-- Alice: 4 lessons in JS course (first section done)
INSERT INTO lesson_progress (user_id, lesson_id, course_id, enrollment_id, watched_secs, is_completed, completed_at, first_watched_at, last_watched_at)
SELECT
  'b2000000-0000-0000-0000-000000000001',
  l.id,
  l.course_id,
  e.id,
  l.duration_seconds,
  true,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day'
FROM lessons l
JOIN enrollments e ON e.user_id = 'b2000000-0000-0000-0000-000000000001'
  AND e.course_id = l.course_id
WHERE l.course_id = 'c3000000-0000-0000-0000-000000000001'
  AND l.sort_order <= 3
  AND l.section_id IN (
    SELECT id FROM sections WHERE course_id = 'c3000000-0000-0000-0000-000000000001' AND sort_order = 1
  )
ON CONFLICT (user_id, lesson_id) DO NOTHING;

-- Bob: 2 lessons in JS course
INSERT INTO lesson_progress (user_id, lesson_id, course_id, enrollment_id, watched_secs, is_completed, completed_at, first_watched_at, last_watched_at)
SELECT
  'b2000000-0000-0000-0000-000000000002',
  l.id,
  l.course_id,
  e.id,
  l.duration_seconds,
  true,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '2 days'
FROM lessons l
JOIN enrollments e ON e.user_id = 'b2000000-0000-0000-0000-000000000002'
  AND e.course_id = l.course_id
WHERE l.course_id = 'c3000000-0000-0000-0000-000000000001'
  AND l.sort_order <= 2
  AND l.section_id IN (
    SELECT id FROM sections WHERE course_id = 'c3000000-0000-0000-0000-000000000001' AND sort_order = 1
  )
ON CONFLICT (user_id, lesson_id) DO NOTHING;

-- Update course_progress percent_complete for affected enrollments
UPDATE course_progress SET
  completed_lessons = (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.enrollment_id = course_progress.enrollment_id AND lp.is_completed),
  percent_complete = CASE
    WHEN total_lessons > 0
    THEN (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.enrollment_id = course_progress.enrollment_id AND lp.is_completed) * 100 / total_lessons
    ELSE 0
  END,
  is_completed = CASE
    WHEN total_lessons > 0
    AND (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.enrollment_id = course_progress.enrollment_id AND lp.is_completed) >= total_lessons
    THEN true ELSE false
  END,
  updated_at = NOW()
WHERE enrollment_id IN (
  SELECT id FROM enrollments WHERE user_id IN (
    'b2000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002'
  )
);

-- ── Forum threads ────────────────────────────
INSERT INTO forum_threads (id, course_id, author_id, title, content) VALUES
  ('f6000000-0000-0000-0000-000000000001',
   'c3000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000001',
   'When would you use let vs const?',
   'I understand both are block-scoped, but Im not sure when to prefer one over the other. Is there a best practice?')
,
  ('f6000000-0000-0000-0000-000000000002',
   'c3000000-0000-0000-0000-000000000002',
   'b2000000-0000-0000-0000-000000000003',
   'Great course! Any recommendations for datasets to practice on?',
   'I finished the pandas section and want to practice more. Any good public datasets to start with?')
,
  ('f6000000-0000-0000-0000-000000000003',
   'c3000000-0000-0000-0000-000000000003',
   'b2000000-0000-0000-0000-000000000002',
   'How do I register my business in Nigeria?',
   'The course covers general principles, but Id love specific guidance on CAC registration and tax setup in Nigeria.')
ON CONFLICT DO NOTHING;

-- ── Forum replies ────────────────────────────
INSERT INTO forum_posts (thread_id, course_id, author_id, content, is_answer)
SELECT id, course_id, 'a1000000-0000-0000-0000-000000000001',
  'Great question! As a general rule: use const by default, and only use let when you know the variable will be reassigned. This makes your code more predictable and easier to reason about.',
  true
FROM forum_threads WHERE title = 'When would you use let vs const?'
ON CONFLICT DO NOTHING;

INSERT INTO forum_posts (thread_id, course_id, author_id, content)
SELECT id, course_id, 'a1000000-0000-0000-0000-000000000002',
  'Kaggle is a great starting point. Also check out data.gov for government datasets and the UCI Machine Learning Repository for classic ML datasets.'
FROM forum_threads WHERE title LIKE '%datasets to practice%'
ON CONFLICT DO NOTHING;

INSERT INTO forum_posts (thread_id, course_id, author_id, content)
SELECT id, course_id, 'a1000000-0000-0000-0000-000000000003',
  'I will add a supplementary lecture on this! For CAC registration, you can do it entirely online via the CAC portal. For taxes, consult with a local accountant — FIRS registration is mandatory.'
FROM forum_threads WHERE title LIKE '%register my business in Nigeria%'
ON CONFLICT DO NOTHING;
