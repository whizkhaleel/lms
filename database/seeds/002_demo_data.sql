-- ─────────────────────────────────────────────
--  Demo Data Seed
--  Run:  psql -U lms_user -d lms < database/seeds/002_demo_data.sql
-- ─────────────────────────────────────────────
-- NOTE: All user accounts have been removed from this seed.
-- The only user is the admin (seeded separately).
-- All courses are owned by the admin (looked up by email).
-- Enrollments, progress, and forum threads have been removed
-- since they require separate student accounts.
-- ─────────────────────────────────────────────

-- ── Courses (owned by admin) ──────────────────
INSERT INTO courses (id, title, slug, description, short_description, status, instructor_id, category_id, level, language, tags, objectives, duration_seconds, lesson_count, published_at)
SELECT * FROM (VALUES
  ('c3000000-0000-0000-0000-000000000001',
   'JavaScript Mastery: From Zero to Hero',
   'javascript-mastery',
   'A comprehensive journey through modern JavaScript. Covers ES6+, async/await, closures, the event loop, modules, and real-world projects. By the end you will build a full-stack web application.',
   'Master modern JavaScript with hands-on projects',
   'published',
   (SELECT id FROM users WHERE email = 'shaheedmahmoudacademy@gmail.com'),
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
   (SELECT id FROM users WHERE email = 'shaheedmahmoudacademy@gmail.com'),
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
   (SELECT id FROM users WHERE email = 'shaheedmahmoudacademy@gmail.com'),
   (SELECT id FROM categories WHERE slug = 'business'),
   'beginner', 'English',
   ARRAY['entrepreneurship','business-plan','marketing','finance'],
   ARRAY['Validate your business idea','Write a professional business plan','Understand startup finances','Launch and market your product'],
   21600, 18, NOW() - INTERVAL '15 days')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = v.column1);

-- ── Sections ─────────────────────────────────
INSERT INTO sections (id, course_id, title, description, sort_order)
SELECT * FROM (VALUES
  ('d4000000-0000-0000-0001-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Getting Started', 'Environment setup and first steps', 1),
  ('d4000000-0000-0000-0001-000000000002', 'c3000000-0000-0000-0000-000000000001', 'Variables & Data Types', 'Understanding the building blocks', 2),
  ('d4000000-0000-0000-0001-000000000003', 'c3000000-0000-0000-0000-000000000001', 'Functions & Scope', 'Deep dive into functions', 3),
  ('d4000000-0000-0000-0001-000000000004', 'c3000000-0000-0000-0000-000000000001', 'DOM Manipulation', 'Working with the browser', 4),
  ('d4000000-0000-0000-0002-000000000001', 'c3000000-0000-0000-0000-000000000002', 'Python Basics Refresher', 'Quick review of Python fundamentals', 1),
  ('d4000000-0000-0000-0002-000000000002', 'c3000000-0000-0000-0000-000000000002', 'NumPy & Pandas', 'Data manipulation essentials', 2),
  ('d4000000-0000-0000-0002-000000000003', 'c3000000-0000-0000-0000-000000000002', 'Data Visualization', 'Creating impactful charts', 3),
  ('d4000000-0000-0000-0002-000000000004', 'c3000000-0000-0000-0000-000000000002', 'Machine Learning Basics', 'Your first ML models', 4),
  ('d4000000-0000-0000-0003-000000000001', 'c3000000-0000-0000-0000-000000000003', 'Finding Your Idea', 'Identifying problems worth solving', 1),
  ('d4000000-0000-0000-0003-000000000002', 'c3000000-0000-0000-0000-000000000003', 'Business Planning', 'Writing a lean business plan', 2),
  ('d4000000-0000-0000-0003-000000000003', 'c3000000-0000-0000-0000-000000000003', 'Marketing & Sales', 'Getting your first customers', 3)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = v.column1);

-- ── Lessons ──────────────────────────────────
INSERT INTO lessons (id, section_id, course_id, title, type, content, duration_seconds, sort_order, is_free_preview, is_published)
SELECT * FROM (VALUES
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
) AS v
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = v.column1);
