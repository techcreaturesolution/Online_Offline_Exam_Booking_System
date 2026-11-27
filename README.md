# TheSpot Exam Booking – Online & Offline Exam Booking System

MERN platform (MongoDB, Express, React, Node) where universities and institutes book exam centers for **online (CBT)** and **offline (pen & paper)** exams, center staff allocate labs and halls without clashes, and everyone tracks exam status, candidate counts, attendance and **lab utilization**.

## Roles

| Role | What they do |
| --- | --- |
| Platform Owner | Runs the SaaS: lists every organisation (tenant) with usage, changes plan, suspends/reactivates, opens an audited 30-minute support session as the tenant's admin |
| Super Admin | Tenant admin: manages centers, labs, organizations and users of its own organisation; approves institute sign-ups; edits branding/settings, exports data, reads the audit log |
| University / Institute | Sees its exams: status, lab/classroom allocation, candidate counts, attendance and utilization; rates the center |
| Network Admin | **Allocates computer labs** for online exams, manages computer labs, completes the network checklist |
| Center In-Charge | **Allocates exam halls/classrooms** for offline exams, manages halls, completes the center checklist, records attendance |
| Exam Conducting Agency | **Creates exams** (institute, center, mode, dates/shifts, candidate count), requests mock days, manages billing, starts exams, records attendance and incidents, marks exams completed |

## Workflow

```
Online : Agency creates exam → Network Admin allocates labs (confirmed)
         → Network + Center checklists → Agency starts → attendance → Agency completes
Offline: Agency creates exam → Center In-Charge allocates classrooms (confirmed)
         → Center checklist (incl. strong room, answer sheets) → Agency starts → attendance → completes
```

Statuses: `requested → confirmed → ready → in_progress → completed` (or `cancelled`). A complete allocation confirms the exam directly; there is no separate verification step. The institute, agency, Network Admin, Center In-Charge and Super Admin all see the exam and its allocation.

## Features

- Seat-level lab allocation per shift with time-overlap conflict checks, maintenance blocks, buffer seats and working-system counts
- Auto-suggested allocation (tightest single lab, else largest labs first)
- Lab utilization report: usable seat-hours vs allocated vs attended, per lab / center / day, with CSV export
- Role dashboards: action-needed queue, status counts, candidates, attendance %, upcoming shifts, utilization charts
- Readiness checklists (network for online; center + strong room/answer sheets for offline)
- Candidate counts only: total candidates per shift at booking; on exam day present / absent per classroom, rolled up per block (Lab **Block** field) and per center (booking page and **Attendance counts** page, `GET /api/reports/attendance?date=`)
- Exam start and attendance only on the exam date; lab-wise attendance recorded by the exam agency
- Mock day for online exams: the agency requests a date before the exam, the Network Admin allocates labs (approved directly), and the agency records the mock result
- Lab planning view with seat ranges per lab for exam shifts and mock days; overlapping exams in one lab get separate seat numbers
- Allocation saves are serialised per center and date, so simultaneous saves cannot overbook a lab
- User directory for the exam agency (all active users except Super Admins)
- Incident log (high severity notifies everyone), center rating
- Billing (rate per seat, invoice, payment status), booking CSV export
- In-app notifications with optional SMTP e-mail copies
- Institute self-registration with admin approval

## Getting started

Requirements: Node 20+, MongoDB 6+.

```bash
npm run install:all
cp .env.example server/.env       # adjust MONGO_URI / JWT_SECRET
npm run seed                      # demo data (wipes the configured database)
npm run dev:server                # API on http://localhost:5000
npm run dev:client                # web on http://localhost:5173 (proxies /api)
```

Demo logins (password `Demo@1234`): `admin@`, `university@`, `institute@`, `network@`, `center@`, `center2@`, `agency@`, `agency2@` – all `@examhub.test`, in tenant `default`. A second tenant `acme` has `admin@acme.test`, and `owner@examhub.test` is the Platform Owner.

### Multi-tenancy

- Every organisation is a tenant; its users only ever see their own centers, labs, bookings, users, reports and audit log. Queries without a tenant context fail (see `docs/DECISIONS.md` #8).
- New organisations start a trial at `/signup` (`POST /api/auth/signup-tenant`); the person signing up becomes its Super Admin.
- Tenant admins manage branding, settings, JSON export, account closure (30-day grace) and the audit log at **Organisation & audit log**.
- Upgrading an existing single-tenant database: `PLATFORM_OWNER_PASSWORD=… npm --prefix server run migrate:tenant -- --slug default --name "Your Org" --owner-email owner@yourdomain` (idempotent; creates the Platform Owner if none exists; `--down` removes tenant fields again).

Production: `npm run build` creates `client/dist`; serve it from any static host with `/api` proxied to `npm start`, or set `VITE_API_URL` at build time and `CLIENT_ORIGIN` on the API.

## Checks

```bash
npm run lint
npm test      # server unit + API tests (uses MONGO_URI_TEST or a local *_test database)
npm run build
```

## Structure

```
server/  Express API: src/models, src/routes, src/services (workflow, allocation, counts, utilization, notify), scripts/seed-demo.js, test/
client/  React + Vite + Tailwind: src/pages, src/components, src/lib
```

## SaaS roadmap and project docs

- [docs/SRS-ExamHub-SaaS.md](docs/SRS-ExamHub-SaaS.md): ExamHub SaaS requirements specification
- [docs/GAP-ANALYSIS.md](docs/GAP-ANALYSIS.md): SRS section 1 checked against the code
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/ROADMAP.md](docs/ROADMAP.md)

## API docs, probes and Docker

- Every route is served under `/api` and `/api/v1`. The OpenAPI spec is `server/openapi.yaml`, and Swagger UI is at `/api/docs`.
- `GET /api/health` is the liveness probe. `GET /api/health/ready` returns 503 until MongoDB is connected.
- `JWT_SECRET=<long-random> docker compose up --build` starts MongoDB and the app (API and built client) on http://localhost:5000.
- CI (`.github/workflows/ci.yml`) runs lint, tests against MongoDB, build, `npm audit --audit-level=high` and a Docker build.
- Prettier: run `npm run format:check` or `npm run format`.
