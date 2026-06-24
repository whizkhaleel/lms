# LMS Platform — AI Code Agent Operating Manual

> **Read this entire document before writing a single line of code.**
> This is your source of truth for every decision you make on this project.
> When this document and the code disagree, trust this document first,
> then investigate the code — there may be a bug to fix.

---

## 1. Project Overview

### What This System Is

A **production-grade Learning Management System (LMS)** for a single Nigerian educational
institution. It is modelled architecturally on Moodle but built from scratch with a modern
stack. It has three user roles (Admin, Instructor, Student), a full course lifecycle,
video streaming, assessments, real-time communication, and a custom payment integration
with an external payment website.

### The Business Flow (Read This Carefully)

```
PAYMENT FLOW (External gateway — the most important flow):
  Visitor → external payment website → pays for a course
  → payment site calls our webhook: POST /api/v1/payments/webhook
    (signed with HMAC-SHA256 using PAYMENT_WEBHOOK_SECRET)
  → we log the event and create a pending manual_payments record
  → Admin reviews in our panel at /admin/payments → clicks Approve
  → Backend automatically:
      1. Creates a new user account (if no account exists for that email)
      2. Generates a temporary password
      3. Enrolls the student in the course
      4. Emails login credentials via Gmail SMTP
  → Student logs in → forced to set a new password
  → Student lands in their enrolled course and starts learning

FREE COURSE FLOW:
  Logged-in student → POST /api/v1/enrollments/enroll → instant access

MANUAL ENROLLMENT (admin override):
  Admin → POST /api/v1/enrollments/manual → student enrolled directly
```

### The Three-Piece Architecture (Critical — Never Violate This)

Like Moodle, the system separates data into exactly three pieces:

| Piece | Contains | Location |
|---|---|---|
| Application Code | All business logic | `apps/backend/` and `apps/frontend/` |
| Database | Metadata only — no file content | PostgreSQL (`pgdata` Docker volume) |
| File Storage | Actual files — videos, PDFs, thumbnails, certificates | `lmsdata/` (Docker named volume) |

**The database NEVER stores file content, binary data, or base64.**
It stores file path, MIME type, size, SHA-256 hash, and a reference ID.
The actual file always lives in `lmsdata/`.

---

## 2. Architecture & Design Patterns

### Backend Architecture: Modular Monolith

Each feature is a self-contained module under `apps/backend/modules/`:

```
modules/
  auth/          → routes, controller, service
  users/         → routes, controller
  courses/       → routes, controller, service
  lessons/       → routes, controller, service
  enrollments/   → routes, controller, service, payment-webhook.routes.js
  files/         → routes, controller, service (the lmsdata engine)
  progress/      → routes, controller, service
  assessments/   → routes, controller, service
  submissions/   → routes, controller, service
  forums/        → routes, controller, service
  messages/      → routes, controller, service
  notifications/ → routes, controller, service
```

### Design Patterns in Use

| Pattern | Where | Why |
|---|---|---|
| Repository-less direct DB | All services | `pg` pool queries directly in service layer — no ORM, no repository abstraction |
| Service layer | All modules | Controllers stay thin (validate input → call service → return response) |
| Event-driven side effects | `server.js` eventBus listeners | Progress triggers, notifications, email sends all decouple via `eventBus.emit()` |
| Strategy pattern | `config/storage.js` | Swap local disk ↔ MinIO without changing any service code |
| Soft deletes | users, courses, lessons, files | `deleted_at` column instead of DELETE — audit trail preserved |
| Token blacklist | Redis | Logged-out JWT access tokens stored in Redis with TTL |
| Refresh token rotation | `auth.service.js` | Every refresh issues a new pair and revokes the old one |
| SHA-256 deduplication | `files.service.js` | Same file uploaded twice → stored once, second upload reuses the DB record |
| HMAC webhook verification | `enrollments.service.js` | External payment site signs raw body; we verify with `crypto.timingSafeEqual` |

### Frontend Architecture

```
src/
  app/              → guards.jsx (RequireAuth, RequireRole, GuestOnly)
  shared/
    api/            → client.js (Axios + auto-refresh), api modules per feature
    components/     → ui/ (Button, Input, Modal, Spinner) + layout/ (Navbar, Sidebar, AppLayout)
    hooks/          → useAuth.js, useNotifications.js
    stores/         → authStore.js (Zustand persisted), socketStore.js (Socket.io singleton)
  features/
    auth/           → LoginPage, ForgotPasswordPage, ChangePasswordPage
    courses/        → CourseCatalogPage, CourseDetailPage
    classroom/      → ClassroomPage, VideoPlayer, CourseProgress
    dashboard/      → StudentDashboard
    assessments/    → QuizPlayer
    instructor/     → InstructorDashboardPage, CourseBuilderPage, SubmissionsPage, CourseAnalyticsPage
    admin/          → AdminDashboardPage, PaymentGatewayPage, AdminAnalyticsPage
    messages/       → MessagesPage
    notifications/  → NotificationDrawer
    certificates/   → CertificatesPage, LeaderboardPage
```

### State Management Rules

- **Server state** → TanStack Query (all API data, caching, invalidation)
- **Client state** → Zustand (auth tokens, socket connection)
- **No Redux** — never introduce it
- **No prop drilling** — use hooks and stores

---

## 3. File Storage System (lmsdata/)

This is the most important system to understand correctly.

### Directory Structure

```
lmsdata/
├── uploads/
│   ├── courses/{courseId}/     → course thumbnails (public — Nginx serves directly)
│   ├── lessons/{lessonId}/     → videos and PDF resources (private — auth-gated)
│   ├── assignments/{assignmentId}/ → student submissions (private)
│   └── avatars/{userId}/       → profile photos (not yet implemented)
├── certificates/               → generated PDF certificates (Phase 8)
├── temp/                       → all uploads land here first, then moved to permanent path
└── private/                    → reserved for sensitive files
```

### The Upload Lifecycle (Every Upload Takes This Path)

```
1. Multer receives file → lmsdata/temp/{uuid}
2. files.service.js → saveFile():
   a. Validate MIME type (not just extension — magic bytes check)
   b. Validate file size (per-context limit)
   c. Compute SHA-256 hash
   d. Check DB for existing file with same hash (deduplication)
   e. If duplicate → reuse existing record, delete temp file
   f. If new → move from temp/ to permanent path
3. INSERT into files table (metadata only — no file content)
4. Return file.id to caller
5. Calling module stores only file.id (FK reference)
```

### File Access Rules

- **Public files** (`is_public = true`): thumbnails — served directly by Nginx, no auth needed
- **Private files** (`is_public = false`): videos, submissions — must go through `GET /api/v1/files/:id` with valid JWT and enrollment check

### Allowed File Contexts

| Context | Allowed MIME Types | Max Size | Location |
|---|---|---|---|
| `avatar` | jpeg, png, webp, gif | 5 MB | `uploads/avatars/{userId}/` |
| `course_thumbnail` | jpeg, png, webp | 5 MB | `uploads/courses/{courseId}/` |
| `lesson_video` | mp4, webm | 500 MB | `uploads/lessons/{lessonId}/` |
| `lesson_resource` | pdf, jpeg, png, webp | 50 MB | `uploads/lessons/{lessonId}/` |
| `assignment_submission` | pdf, docx, jpeg, png, txt, zip | 100 MB | `uploads/assignments/{assignmentId}/` |

---

## 4. Database Schema

### Migrations Applied (in order)

| File | Tables Created |
|---|---|
| `001_extensions_enums.sql` | pgcrypto extension, all ENUMs (user_role, user_status, course_status, lesson_type, enrollment_status, submission_status, notification_type, storage_backend, question_type, payment_method, payment_origin, manual_payment_status) |
| `002_users_auth.sql` | users, email_verification_tokens, password_reset_tokens, refresh_tokens, audit_logs, update_updated_at() trigger |
| `003_files.sql` | files |
| `004_courses.sql` | categories, courses, sections, lessons, lesson_resources, seeded 8 categories |
| `005_enrollments.sql` | enrollments |
| `006_progress.sql` | lesson_progress, course_progress, video_bookmarks, init_course_progress trigger |
| `007_assessments.sql` | quizzes, quiz_questions, quiz_attempts, quiz_answers, assignments, assignment_submissions, grades |
| `008_manual_payments.sql` | manual_payments |
| `009_comms.sql` | forum_threads, forum_posts, forum_reactions, dm_conversations, dm_messages, notifications, notification_prefs |
| `011_forum_thread_notification.sql` | Adds `forum_thread_created` to `notification_type` enum |
| `012_certificates_gamification.sql` | `certificates`, `user_xp`, `xp_transactions`, `badges`, `user_badges`, adds `xp_earned` to `course_progress` |

### Key Design Decisions

- **All primary keys**: UUID (`gen_random_uuid()`)
- **Soft deletes**: `deleted_at TIMESTAMP` on users, courses, lessons, files
- **Denormalized counters**: `courses.student_count`, `courses.lesson_count` — updated programmatically, not via COUNT(*)
- **Audit log**: every significant action inserts into `audit_logs` with actor_id, action string, before/after JSONB
- **File FK pattern**: courses store `thumbnail_file_id UUID REFERENCES files(id)` — never the path directly
- **New migration rule**: every new `.sql` added to `database/migrations/` MUST also be copied to `database/init/` with the next sequential number

### Adding a New Migration (The Correct Procedure)

```bash
# 1. Create migration file (next number in sequence)
touch database/migrations/011_your_feature.sql

# 2. Write the SQL

# 3. Copy to init/ with next init sequence number
cp database/migrations/011_your_feature.sql database/init/012_your_feature.sql

# 4. If Docker volume already has the DB, apply it manually:
make migrate

# 5. If starting fresh (dev reset):
make fresh   # wipes volumes + restarts — applies everything from init/
```

---

## 5. API Surface (Complete Reference)

Base URL: `http://localhost/api/v1`

### Authentication — `/api/v1/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Register new student account |
| POST | `/login` | Public | Login → returns accessToken + refreshToken + mustChangePassword |
| POST | `/refresh` | Public | Rotate tokens |
| GET | `/verify-email?token=` | Public | Activate account from email link |
| POST | `/forgot-password` | Public | Sends reset email |
| POST | `/reset-password` | Public | Applies new password from reset token |
| POST | `/logout` | Student+ | Blacklists access token in Redis |
| GET | `/me` | Student+ | Returns current user profile incl. must_change_password |

### Users — `/api/v1/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | Student+ | Own profile + must_change_password |
| PATCH | `/profile` | Student+ | Update name, bio, headline |
| PATCH | `/password` | Student+ | Change password (clears must_change_password) |
| GET | `/` | Admin | List all users (paginated, filterable by role/status/search) |
| GET | `/:id` | Admin | Get single user |
| PATCH | `/:id/role` | Admin | Change role |
| PATCH | `/:id/status` | Admin | Suspend / activate / deactivate |
| DELETE | `/:id` | Admin | Soft delete |

### Courses — `/api/v1/courses`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Course catalog (published only, paginated, filterable) |
| GET | `/categories` | Public | List all categories |
| GET | `/my-courses` | Instructor+ | Instructor's own courses (all statuses). Admin sees all courses |
| GET | `/:slug` | Public | Full course detail with sections + lessons (owner can see drafts) |
| POST | `/` | Instructor+ | Create course (status = draft) |
| PATCH | `/:id` | Instructor+ | Update course details |
| PATCH | `/:id/publish` | Instructor+ | Publish (requires at least 1 lesson) |
| PATCH | `/:id/unpublish` | Instructor+ | Move back to draft |
| DELETE | `/:id` | Instructor+ | Soft delete |
| POST | `/:id/thumbnail` | Instructor+ | Upload thumbnail (multipart, field: thumbnail) |
| POST | `/:courseId/sections` | Instructor+ | Create section |
| PATCH | `/:courseId/sections/:sectionId` | Instructor+ | Update section |
| DELETE | `/:courseId/sections/:sectionId` | Instructor+ | Delete section (cascades to lessons) |
| PATCH | `/:courseId/sections/reorder` | Instructor+ | Reorder sections (body: { orderedIds: [] }) |

### Lessons — `/api/v1/courses/:courseId/lessons`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:lessonId/preview` | Public | Free preview lesson only |
| GET | `/:lessonId` | Student (enrolled) | Full lesson with video_path and resources |
| POST | `/` | Instructor+ | Create lesson (body requires sectionId) |
| PATCH | `/:lessonId` | Instructor+ | Update lesson (title, content, isPublished, isFreePreview) |
| DELETE | `/:lessonId` | Instructor+ | Soft delete |
| PATCH | `/reorder` | Instructor+ | Reorder (body: { sectionId, orderedIds }) |
| POST | `/:lessonId/video` | Instructor+ | Upload video (multipart, field: video) |
| POST | `/:lessonId/resources` | Instructor+ | Upload resource PDF (multipart, field: resource) |
| DELETE | `/:lessonId/resources/:resourceId` | Instructor+ | Delete resource |

### Enrollments — `/api/v1/enrollments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/enroll` | Student | Enroll in free course (paid → error, contact admin) |
| GET | `/my` | Student | My enrollments with progress |
| GET | `/` | Admin | All enrollments (paginated) |
| POST | `/manual` | Admin | Manually enroll student (body: { userId, courseId, note }) |
| GET | `/course/:courseId` | Instructor+ | Enrollments for a course |
| PATCH | `/:enrollmentId/revoke` | Admin | Revoke access |
| GET | `/payments` | Admin | Admin-recorded payments |
| POST | `/payments` | Admin | Record manual payment |
| PATCH | `/payments/:id/confirm` | Admin | Confirm payment + enroll |
| PATCH | `/payments/:id/reject` | Admin | Reject payment |
| GET | `/payments/gateway` | Admin | Gateway webhook payments (pending/confirmed/rejected) |
| PATCH | `/payments/gateway/:id/approve` | Admin | Approve + auto-create account + enroll + email |
| PATCH | `/payments/gateway/:id/reject` | Admin | Reject + email buyer |

### External Payment Webhook — `/api/v1/payments/webhook`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | HMAC signature | Called by external payment site — NOT by logged-in users |

**Webhook payload shape:**
```json
{
  "externalReference": "PAY-2026-00041",
  "courseId": "uuid",
  "amount": 15000,
  "currency": "NGN",
  "paymentMethod": "card_gateway",
  "buyer": { "email": "student@example.com", "firstName": "Amina", "lastName": "Bello", "phone": "0801234567" }
}
```
**Signature header:** `X-Webhook-Signature: <HMAC-SHA256 of raw body using PAYMENT_WEBHOOK_SECRET>`

### Progress — `/api/v1/progress`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Student | All enrolled courses with progress stats |
| GET | `/courses/:courseId` | Student | Full course progress with lesson checklist |
| GET | `/lessons/:lessonId?courseId=` | Student | Resume position for a specific lesson |
| POST | `/heartbeat` | Student | Video player ping (every 10s) — body: { lessonId, courseId, positionSecs, watchedSecs } |
| POST | `/lessons/:lessonId/complete` | Student | Manually mark complete |
| POST | `/lessons/:lessonId/incomplete` | Student | Unmark complete |
| POST | `/lessons/:lessonId/bookmarks` | Student | Add video bookmark |
| GET | `/lessons/:lessonId/bookmarks` | Student | List bookmarks |
| DELETE | `/lessons/:lessonId/bookmarks/:id` | Student | Delete bookmark |
| GET | `/analytics/courses/:courseId` | Instructor+ | Per-lesson completion rates |

### Assessments — `/api/v1/assessments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/quizzes` | Instructor+ | Create quiz (body requires lessonId + courseId; lesson.type must be 'quiz') |
| GET | `/quizzes/:quizId` | Instructor+ | Full quiz with questions (incl. correct answers) |
| PATCH | `/quizzes/:quizId` | Instructor+ | Update quiz settings |
| GET | `/quizzes/:quizId/analytics` | Instructor+ | Per-question difficulty stats |
| POST | `/quizzes/:quizId/questions` | Instructor+ | Add question |
| PATCH | `/quizzes/:quizId/questions/:id` | Instructor+ | Update question |
| DELETE | `/quizzes/:quizId/questions/:id` | Instructor+ | Delete question |
| PATCH | `/answers/:answerId/grade` | Instructor+ | Grade short-answer question |
| POST | `/quizzes/:quizId/start` | Student | Start attempt → returns questions without answers |
| POST | `/attempts/:attemptId/submit` | Student | Submit answers → returns score + review |
| GET | `/attempts/:attemptId/result` | Student | View submitted attempt result |
| GET | `/quizzes/:quizId/my-attempts` | Student | All my attempts for this quiz |

### Submissions — `/api/v1/submissions`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/assignments?courseId=:id` | Instructor+ | List assignments for a course |
| POST | `/assignments` | Instructor+ | Create assignment (lessonId + courseId; lesson.type must be 'assignment') |
| GET | `/assignments/:id` | Student+ | Get assignment details |
| PATCH | `/assignments/:id` | Instructor+ | Update assignment |
| POST | `/assignments/:id/submit` | Student | Submit (multipart, field: files[]) |
| GET | `/assignments/:id/my-submission` | Student | My submissions for this assignment |
| GET | `/assignments/:id/submissions` | Instructor+ | All student submissions |
| GET | `/submissions/:id` | Student/Instructor+ | Get submission detail |
| PATCH | `/submissions/:id/grade` | Instructor+ | Grade submission (body: { score, feedback }) |
| GET | `/gradebook/:courseId` | Student | My gradebook for a course |
| GET | `/gradebook/:courseId/user/:userId` | Instructor+ | Another student's gradebook |

### Certificates — `/api/v1/certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/my` | Student+ | My certificates |
| GET | `/my/xp` | Student+ | My XP, level, and earned badges |
| GET | `/leaderboard` | Student+ | Top users by XP (query: ?limit=) |
| GET | `/courses/:courseId` | Instructor+ | Certificates issued for a course |

### Files — `/api/v1/files`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/upload` | Student+ | Upload file (multipart, fields: file, context, ownerId, isPublic) |
| GET | `/:id` | Student+ (enrolled check for private) | Stream / download file |
| DELETE | `/:id` | Student+ | Soft delete file record |

### Forums — `/api/v1/courses/:courseId/forums`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Enrolled+ | List threads |
| POST | `/` | Enrolled+ | Create thread |
| GET | `/:threadId` | Enrolled+ | Get thread (increments view count) |
| PATCH | `/:threadId` | Author/Instructor+ | Update thread |
| DELETE | `/:threadId` | Author/Instructor+ | Soft delete thread |
| PATCH | `/:threadId/pin` | Instructor+ | Pin/unpin |
| PATCH | `/:threadId/lock` | Instructor+ | Lock/unlock |
| GET | `/:threadId/posts` | Enrolled+ | List posts (paginated) |
| POST | `/:threadId/posts` | Enrolled+ | Reply to thread |
| PATCH | `/:threadId/posts/:postId` | Author/Instructor+ | Edit post |
| DELETE | `/:threadId/posts/:postId` | Author/Instructor+ | Soft delete post |
| PATCH | `/:threadId/posts/:postId/answer` | Instructor+ | Toggle accepted answer |
| POST | `/:threadId/posts/:postId/react` | Enrolled+ | Toggle emoji reaction (body: { emoji }) |

### Messages — `/api/v1/messages`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Student+ | My conversations |
| GET | `/unread-count` | Student+ | Total unread DM count |
| GET | `/:conversationId/messages` | Student+ | Messages in conversation (marks as read) |
| POST | `/send` | Student+ | Send DM (body: { recipientId, content }) |
| DELETE | `/:conversationId/messages/:messageId` | Student+ | Soft delete own message |

**Messaging rules:**
- Students can only message instructors of courses they are enrolled in
- Instructors can message any of their enrolled students or admins
- Admins can message anyone

### Notifications — `/api/v1/notifications`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Student+ | List notifications (paginated, ?unreadOnly=true) |
| GET | `/unread-count` | Student+ | Badge count |
| PATCH | `/read` | Student+ | Mark read (body: { ids: [] } → empty = mark all) |
| DELETE | `/:notificationId` | Student+ | Delete |
| GET | `/preferences` | Student+ | Notification preferences |
| PATCH | `/preferences/:type` | Student+ | Toggle in_app/email per type |

---

## 6. Environment Variables

All required variables. Backend will refuse to boot if any of the starred (*) ones are missing.

```env
NODE_ENV=development
APP_NAME=LMS Platform
APP_URL=http://localhost
BACKEND_PORT=5000
FRONTEND_PORT=3000
VITE_API_URL=http://localhost/api/v1

# Database *
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=lms_db
POSTGRES_USER=lms_user
POSTGRES_PASSWORD=

# Redis *
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT *
JWT_ACCESS_SECRET=         # min 32 chars
JWT_REFRESH_SECRET=        # min 32 chars, different from ACCESS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# File Storage
STORAGE_BACKEND=local      # 'local' or 'minio'
LMSDATA_PATH=/app/lmsdata

# MinIO (only needed if STORAGE_BACKEND=minio)
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=lms-files

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=              # Gmail address
SMTP_PASS=              # Gmail App Password (NOT your login password)
EMAIL_FROM="LMS Platform <your-email@gmail.com>"

# External Payment Gateway *
PAYMENT_WEBHOOK_SECRET= # Shared with the external payment website

# Security
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 7. Socket.io Rooms

| Room | Joined by | Used for |
|---|---|---|
| `user_{userId}` | Client on login via `join_user` event | Personal notifications, DM badge updates, quiz results, grading alerts |
| `course_{courseId}_instructors` | Instructor client via `join_course` event | New submission alerts |
| `dm_{conversationId}` | Both DM participants via `join_dm` event | Real-time message delivery, typing indicators |

### Socket events emitted TO the client

| Event | Data | Trigger |
|---|---|---|
| `notification` | `{ id, type, title, body, data, createdAt }` | Any notification created |
| `lesson_completed` | `{ lessonId, courseId }` | Student completes a lesson |
| `course_completed` | `{ courseId }` | Student reaches 100% progress |
| `quiz_result` | `{ courseId, passed, scorePct }` | Quiz submitted and auto-graded |
| `assignment_graded` | `{ submissionId, score, passed }` | Instructor grades a submission |
| `submission_pending` | `{ submissionId, userId }` | Student submits assignment (to instructor room) |
| `new_message` | `{ conversationId, message }` | DM sent (to dm room) |
| `dm_received` | `{ conversationId, senderName, preview }` | DM sent (to recipient's user room) |
| `dm_typing` | `{ userId, isTyping }` | Typing indicator in DM |

---

## 8. Frontend Routes

| Path | Component | Access |
|---|---|---|
| `/` | → redirects to `/courses` | Public |
| `/courses` | CourseCatalogPage | Public |
| `/courses/:slug` | CourseDetailPage | Public |
| `/login` | LoginPage | Guest only |
| `/register` | Route not mounted — admin-only via POST /api/v1/users | Guest only (not accessible) |
| `/forgot-password` | ForgotPasswordPage | Guest only |
| `/reset-password` | ResetPasswordPage | Guest only |
| `/change-password` | ChangePasswordPage | Logged in (forced after auto-provisioning) |
| `/learn/:courseId` | ClassroomPage | Enrolled student+ |
| `/learn/:courseId/lessons/:lessonId` | ClassroomPage | Enrolled student+ |
| `/dashboard` | StudentDashboard | Student+ |
| `/profile` | ProfilePage | Student+ |
| `/messages` | MessagesPage | Student+ |
| `/notifications` | NotificationsPage | Student+ |
| `/achievements` | CertificatesPage | Student+ |
| `/leaderboard` | LeaderboardPage | Student+ |
| `/instructor` | InstructorDashboardPage | Instructor+ |
| `/instructor/courses/new` | CourseBuilderPage | Instructor+ |
| `/instructor/courses/:id/edit` | CourseBuilderPage | Instructor+ |
| `/instructor/courses/:id/analytics` | CourseAnalyticsPage | Instructor+ |
| `/instructor/submissions` | SubmissionsPage | Instructor+ |
| `/instructor/analytics` | InstructorAnalyticsPage | Instructor+ |
| `/admin` | AdminDashboardPage | Admin+ |
| `/admin/users` | AdminUsersPage | Admin+ |
| `/admin/courses` | AdminCoursesPage | Admin+ |
| `/admin/enrollments` | AdminEnrollmentsPage | Admin+ |
| `/admin/payments` | PaymentGatewayPage | Admin+ |
| `/admin/analytics` | AdminAnalyticsPage | Admin+ |

**Placeholders** = all previously placeholder routes are now built (SubmissionsPage, CourseAnalyticsPage, AdminAnalyticsPage).

---

## 9. Build Phase Status

### Completed Phases ✅

| Phase | Deliverables | Status |
|---|---|---|
| 1 | Project scaffold, Docker, DB schema, Auth system | ✅ Complete |
| 2 | Course CRUD, file uploads, enrollment system | ✅ Complete |
| 3 | Video player, progress tracking, lesson completion | ✅ Complete |
| 4 | Quizzes, assignments, grading engine | ✅ Complete |
| 5 | Payment system → replaced with manual + gateway flow | ✅ Complete |
| 6 | Forums, messaging, real-time notifications | ✅ Complete |
| 7 | Full React frontend build (app shell + all core pages) | ✅ Complete |
| 8 | Certificates & Gamification — PDF certificates (pdfkit), XP system, badges, leaderboard, streak rewards | ✅ Complete |
| Gateway | External payment webhook + account auto-provisioning + Gmail email | ✅ Complete |
| Option A (partial) | Backend bug fixes (route ordering, /my-courses endpoint, admin getAllCourses) | ✅ Complete |

### In Progress 🔄

(none)

### Remaining Phases ⬜

| Phase | Deliverables |
|---|---|
| 9 — Admin Panel Completion | Full admin analytics dashboard (revenue, engagement, completion rates), audit log viewer, institution settings, user bulk actions |
| 10 — Performance & Caching | Redis caching strategy for course catalog and dashboard, DB query optimization (EXPLAIN ANALYZE), connection pooling tuning |
| 11 — Load Testing & Security Hardening | k6 load testing suite, rate limiting audit, SQL injection verification, file upload security review, CORS hardening |
| 12 — CI/CD & Production Hardening | GitHub Actions pipeline, Prometheus + Grafana monitoring, automated DB backups, SSL setup, docker-compose.prod.yml, health check endpoints |

---

## 10. Agent Operating Rules (Non-Negotiable)

### Before Starting Any Session

```
1. Read this file (agent.md) in full
2. Run: make status          → confirm all containers are healthy
3. Run: curl http://localhost/api/health  → confirm backend is alive
4. Ask the developer: "Which phase/task are we working on today?"
5. Do NOT write any code until you have a clear task
```

### The Phase Gate Rule

**You must not proceed to the next phase until:**
1. All code for the current phase is written
2. Tests are run and pass (see test commands below)
3. You have shown the developer the test output
4. The developer has explicitly said "phase X passed — start phase Y"

This rule exists because each phase has database migrations and API contracts
that the next phase depends on. A skipped test in phase N causes a hidden bug
discovered in phase N+3 that is very expensive to fix.

### The Migration Rule

Every database migration must:
1. Be created in `database/migrations/` with the next number in sequence
2. Be copied to `database/init/` with the next init sequence number
3. Be applied to the running Docker DB with `make migrate` (if already running)

If you forget this, `make fresh` (wipes everything) will work,
but the developer loses all their test data. Always sync the init folder.

### The Test Commands

```bash
# Health check
curl http://localhost/api/health

# Backend syntax check (run after every backend change)
cd apps/backend && node --check <changed-file.js>

# Test a specific endpoint (replace TOKEN and IDs as needed)
curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lms.local","password":"Admin@12345"}' | jq .

# Check new tables exist
docker compose exec postgres psql -U lms_user -d lms_db -c "\dt"

# Watch backend logs
make logs-backend

# Full reset (wipes all data — use only when developer approves)
make fresh
```

### Code Style Rules

- **Plain JavaScript only** — no TypeScript, ever
- **No ORM** — raw `pg` pool queries only
- **No Redux** — Zustand for client state, TanStack Query for server state
- **No class components** — React hooks only
- **Error handling**: always use `ApiError` (backend) and `toast.error()` (frontend)
- **Response format**: always use `ApiResponse.success()` / `ApiResponse.created()` / `ApiResponse.paginated()`
- **Route pattern**: `authenticate` middleware first, then `authorize('role')`, then controller
- **Soft deletes**: `UPDATE SET deleted_at = NOW()` — never `DELETE FROM`
- **UUID everywhere**: never sequential integer IDs
- **File writes**: always to `lmsdata/` via `files.service.js` — never write files anywhere else

### When Adding a New Module

```
1. Create: apps/backend/modules/{name}/{name}.routes.js
2. Create: apps/backend/modules/{name}/{name}.service.js
3. Create: apps/backend/modules/{name}/{name}.controller.js
4. Import and mount in: apps/backend/server.js
5. Wire into frontend: apps/frontend/src/shared/api/{name}.api.js
6. Add to barrel: apps/frontend/src/shared/api/index.js
7. Create page(s): apps/frontend/src/features/{name}/pages/
8. Register routes: apps/frontend/src/App.jsx
```

### When Adding a New Database Table

```
1. Create migration file in database/migrations/ (next number)
2. Copy to database/init/ (next number in init sequence)
3. Run: make migrate
4. Verify: docker compose exec postgres psql -U lms_user -d lms_db -c "\dt"
5. Update this document (agent.md) — Section 4 Migration table
```

### Permission Required Before Doing Any of These

- Changing an existing DB column type or removing a column
- Adding a new Docker service to docker-compose.yml
- Changing the authentication flow (tokens, refresh rotation, blacklisting)
- Changing the file storage architecture
- Modifying the payment webhook signature verification
- Introducing a new npm package (explain why the existing ones aren't sufficient)
- Changing the Nginx routing rules

---

## 11. Known Issues & Technical Debt

These are issues noted during development that must be addressed
before Phase 12 (production hardening):

| Issue | Location | Impact | Fix |
|---|---|---|---|---|---|
| `lmsdata/uploads/avatars/` not yet used | lmsdata | Profile photos not implemented | Phase 9 |
| `BACKEND_PORT=0` resolves to 5000 | config/env.js | Minor — parseInt('0') is 0 but || 5000 kicks in | Low priority |
| `temp/` directory cleanup | lmsdata/temp/ | Orphaned temp files if upload fails mid-way | Add cron cleanup worker in Phase 10 |
| Video streaming is full download | files.controller.js | No range request / chunked streaming | Add Accept-Ranges header support in Phase 11 |
| No email queue | server.js | Email failures in eventBus listeners are fire-and-forget | Add BullMQ email worker in Phase 10 |
| `pagenate.js` filename typo | shared/utils/ | File is misspelled (missing 'i') | Rename to paginate.js (breaking change — all imports must update) |
| Dead `payment_method` enum type | migrations/010 | Created but never attached to any column | Remove from migration or attach to column |

---

## 12. Default Credentials

**Admin account (seeded in `004_seed_admin.sql`):**
- Email: `admin@lms.local`
- Password: `Admin@12345`
- **Change this immediately after first login in any real deployment**

---

## 13. Makefile Quick Reference

```bash
make up              # Start all containers
make down            # Stop all containers
make build           # Rebuild images after code changes
make fresh           # Nuclear reset — wipe volumes + restart
make status          # Show container status

make logs            # Tail all logs
make logs-backend    # Backend logs only
make logs-db         # Postgres logs only

make migrate         # Apply pending migrations
make seed            # Run seed files
make migrate-reset   # ⚠️ Wipe DB and re-run all (dev only)

make shell-backend   # sh into backend container
make shell-db        # psql into postgres container

make test            # Run test suite
make test-unit       # Unit tests only
make test-coverage   # Coverage report
```

---

## 14. Session Handoff Checklist

When ending a session, the agent must confirm the following before closing:

- [ ] All new/changed files pass `node --check` (backend) or build without errors (frontend)
- [ ] `curl http://localhost/api/health` returns `{ "status": "ok" }`
- [ ] Any new migrations have been copied to `database/init/`
- [ ] This document (`agent.md`) has been updated if any new routes, tables, or phases changed
- [ ] The developer has been told exactly what was completed and what is next
- [ ] No uncommitted `.env` file was created