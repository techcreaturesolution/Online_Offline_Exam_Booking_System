# TheSpot Exam Booking – Online & Offline Exam Booking System

MERN platform (MongoDB, Express, React, Node) where universities and institutes book exam centers for **online (CBT)** and **offline (pen & paper)** exams, center staff allocate labs and halls without clashes, and everyone tracks exam status, candidate counts, attendance and **lab utilization**.

## Roles

| Role | What they do |
| --- | --- |
| Super Admin | Manages centers, labs, organizations and users; approves institute sign-ups; sees everything |
| University / Institute | Requests bookings, uploads candidates, verifies **offline** hall allocation, tracks status/counts/utilization, rates the center |
| Booking Vendor | Owns centers commercially; **verifies the Network Admin's lab allocation** for online exams, assigns agency, manages billing |
| Network Admin | **Allocates computer labs** for online exams, manages computer labs, completes the network checklist |
| Center In-Charge | **Allocates exam halls/classrooms** for offline exams, manages halls, completes the center checklist, records attendance |
| Exam Conducting Agency | Starts assigned exams, records attendance and incidents, marks exams completed |

## Workflow

```
Online : Institute requests → Network Admin allocates labs → Booking Vendor verifies
         → Network + Center checklists → Agency starts → attendance → Agency completes
Offline: Institute requests → Center In-Charge allocates halls → Institute verifies
         → Center checklist (incl. strong room, answer sheets) → Agency starts → attendance → completes
```

Statuses: `requested → allocated → confirmed → ready → in_progress → completed` (or `cancelled`). A reviewer can request changes, which sends the booking back to `requested`.

## Features

- Seat-level lab allocation per shift with time-overlap conflict checks, maintenance blocks, buffer seats and working-system counts
- Auto-suggested allocation (tightest single lab, else largest labs first)
- Lab utilization report: usable seat-hours vs allocated vs attended, per lab / center / day, with CSV export
- Role dashboards: action-needed queue, status counts, candidates, attendance %, upcoming shifts, utilization charts
- Readiness checklists (network for online; center + strong room/answer sheets for offline)
- Candidate CSV upload, automatic seat plan, printable seat list and CSV
- Exam start and attendance only on the exam date; lab-wise attendance recorded by the exam agency
- Mock day for online exams: institute or agency requests a date before the exam, the Network Admin allocates labs, the Booking Vendor grants lab permission, and the agency records the mock result
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

Demo logins (password `Demo@1234`): `admin@`, `university@`, `institute@`, `vendor@`, `network@`, `center@`, `center2@`, `agency@`, `agency2@` – all `@examhub.test`.

Production: `npm run build` creates `client/dist`; serve it from any static host with `/api` proxied to `npm start`, or set `VITE_API_URL` at build time and `CLIENT_ORIGIN` on the API.

## Checks

```bash
npm run lint
npm test      # server unit + API tests (uses MONGO_URI_TEST or a local *_test database)
npm run build
```

## Structure

```
server/  Express API: src/models, src/routes, src/services (workflow, allocation, utilization, seat plan, notify), scripts/seed-demo.js, test/
client/  React + Vite + Tailwind: src/pages, src/components, src/lib
```
