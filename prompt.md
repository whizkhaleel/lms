# LMS Platform — AI Code Agent Handoff Brief

## What You Are Taking Over

You are receiving a **partially built, production-grade Learning Management System (LMS)**
similar to Moodle, built from scratch by a senior engineer across multiple sessions.
The system is real, functional, and deployed locally via Docker.
Your job is to continue building it — feature by feature, phase by phase —
without breaking what already works.

**Read `agent.md` first and in full before writing a single line of code.**
That document contains the operating rules, architecture decisions, file layout,
and phase-by-phase status that govern every decision you make.

---

## The Project in Plain Terms

A Nigerian educational institution runs a **separate payment website** where students
browse and pay for courses. Once payment is confirmed by an admin, the student receives
login credentials by email and is automatically enrolled. The platform then delivers
the full learning experience: video lessons, quizzes, assignments, forums, and certificates.

**Three types of users:**
- **Admin** — manages everything: approves payments, manages users and courses, sees analytics
- **Instructor** — creates and publishes courses, grades assignments, monitors students
- **Student** — watches lessons, takes quizzes, submits assignments, earns certificates

---

## Technology Stack (Do Not Change Without Permission)

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TanStack Query, Zustand, Tailwind CSS, Socket.io-client |
| Backend | Node.js, Express (plain JS — not TypeScript) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis + BullMQ |
| File Storage | Local disk (`lmsdata/`) with MinIO/S3 as a swap-in option |
| Real-time | Socket.io |
| Email | Nodemailer (Gmail SMTP) |
| Containers | Docker + Docker Compose |
| Reverse Proxy | Nginx |

---

## Where the Code Lives

```
lms/
├── apps/
│   ├── backend/          Node.js Express API
│   └── frontend/         React + Vite SPA
├── database/
│   ├── init/             Auto-run on first Docker boot (migrations + seed)
│   ├── migrations/       Source-of-truth SQL files
│   └── seeds/            Seed data
├── lmsdata/              File storage (Moodle's moodledata equivalent)
├── nginx/                Reverse proxy config
├── docker-compose.yml
├── .env.example          Commit this. Never commit .env
├── Makefile              Run `make help` to see all commands
└── agent.md              YOUR OPERATING MANUAL — read it first
```

---

## How to Start Every Session

1. Read `agent.md` — specifically the "Current State" and "Remaining Phases" sections
2. Run `make status` to confirm Docker is up
3. Run `curl http://localhost/api/health` to confirm the backend is alive
4. Ask the developer which phase or task to work on
5. Do not proceed to the next phase without explicit developer approval

---

## Non-Negotiable Rules

1. **Never skip a phase** — each phase builds on the last
2. **Never assume success** — run tests and show output before marking anything done
3. **Never break existing endpoints** — check `agent.md` for the full API surface
4. **Always sync migrations** — every new `.sql` file in `migrations/` must also be copied to `init/` with the next number in sequence
5. **Never commit `.env`** — environment secrets live only in `.env`
6. **Ask before architectural changes** — changing DB schema, adding new services, or modifying the payment flow requires developer approval first
7. **Plain JS only** — no TypeScript, no class components, no Redux
8. **One phase at a time** — complete it, test it, get approval, then move on

---

## Who Owns This Project

This is a solo developer project (Yaseer Ibrahim) building a production LMS
for a Nigerian institution. The developer has deep context on every decision made.
When in doubt, ask.