> Source: Software Requirements Specification ExamHub SaaS.docx (v1.0, 26 Nov 2026), converted to Markdown. Section 1 is reconciled with the code in [GAP-ANALYSIS.md](GAP-ANALYSIS.md).

## Software Requirements Specification: ExamHub SaaS

Product: Multi-tenant Online and Offline Exam Booking Platform Base repository: techcreaturesolution/Online_Offline_Exam_Booking_System (TheSpot Exam Booking, MERN) Version: 1.0 | Date: 26 Nov 2026 | Intended executor: Devin AI

### 1. Analysis of the Existing Repository

#### 1.1 What exists today

The repo is a MERN application (MongoDB 6+, Express, React + Vite + Tailwind, Node 20+) with client/ and server/ folders. The server is organised as src/models, src/routes, src/services (workflow, allocation, utilization, seat plan, notify), scripts/seed-demo.js and test/. The README reports lint, tests and build scripts, 21 commits, no releases, no description or topics.

Roles: Super Admin, University/Institute, Booking Vendor, Network Admin, Center In-Charge, Exam Conducting Agency.

Workflows:

- Online (CBT): Institute requests, Network Admin allocates labs, Booking Vendor verifies, network and center checklists, Agency starts, attendance, Agency completes.
- Offline: Institute requests, Center In-Charge allocates halls, Institute verifies, center checklist (strong room, answer sheets), Agency starts, attendance, complete.
- Status machine: requested, allocated, confirmed, ready, in_progress, completed, cancelled (reviewer can send back to requested).

Implemented features: seat-level lab allocation per shift with overlap checks, maintenance blocks, buffer seats and working-system counts; auto-suggested allocation; utilization report with CSV; role dashboards; readiness checklists; candidate CSV upload and seat plan; attendance on exam date only; mock day for online exams; per-center-and-date serialised allocation saves; incident log; center rating; billing (rate per seat, invoice, payment status); in-app notifications with optional SMTP; institute self-registration with admin approval.

#### 1.2 Strengths

- Domain logic is already strong: conflict-free seat allocation, mock day, dual online/offline workflows, utilization analytics.
- Clear role separation and a documented status machine.
- Service-layer structure and tests exist, so new modules can follow the same pattern.
#### 1.3 Gaps (what is needed to make it a SaaS product)

| Area | Gap |
|---|---|
| Tenancy | Single-organisation design; no tenant isolation, tenant onboarding, or per-tenant settings |
| Commercials | No subscription plans, trials, metering, platform invoicing, or payment gateway |
| Booking | No public center discovery, availability calendar, slot holds, or online payment at booking time |
| Candidates | No candidate-facing portal, admit card, or QR check-in |
| Operations | No audit trail, no SMS/WhatsApp, no file storage abstraction, no background job queue |
| Security | No MFA, SSO, rate limiting, or granular RBAC beyond fixed roles (not confirmed from README; verify in code) |
| Platform | No API keys/webhooks, no white-label branding, no i18n, no observability, no Docker/CI-CD |
| Docs | No OpenAPI spec, no repo description or topics |

Note: this analysis is based on the repository landing page and README. Devin must first read the full source and reconcile any differences before implementing (see section 12).

### 2. Introduction

#### 2.1 Purpose

This document specifies requirements to evolve the existing system into ExamHub SaaS: a subscription-based, multi-tenant platform where exam-center networks, universities, institutes and exam agencies book, run and analyse online and offline exams.

#### 2.2 Scope

In scope: retain all existing functionality (section 5), add multi-tenancy, subscriptions and billing, candidate portal, public booking marketplace, advanced RBAC, integrations, analytics, security and DevOps. Out of scope for v1: building an exam-question authoring or proctoring engine (only integration hooks), native mobile apps (responsive PWA only).

#### 2.3 Definitions

- Platform = ExamHub SaaS operator. Tenant = a customer organisation. Center = physical exam venue with labs/halls. Shift = a timed exam session. CBT = computer based test. Mock day = pre-exam dry run.
#### 2.4 Requirement keywords

MUST = mandatory for release, SHOULD = recommended, MAY = optional. IDs are referenced by Devin task breakdown.

### 3. Overall Description

#### 3.1 Tenant types

A tenant is one of: Center Network / Vendor (owns centers, labs, halls), Institute / University (books exams), Exam Agency (conducts exams). One tenant MAY hold more than one type.

#### 3.2 Roles

Platform level: Platform Owner, Platform Support, Platform Finance. Tenant level (existing, retained): Tenant Admin (replaces Super Admin inside a tenant), University/Institute, Booking Vendor, Network Admin, Center In-Charge, Exam Agency. New: Invigilator, Candidate, Auditor (read-only), Finance Manager, Custom roles (tenant-defined).

#### 3.3 Tenancy model

Shared database, shared schema, with a mandatory tenantId on every tenant-owned document and a server-enforced scoping layer. Cross-tenant bookings (an Institute tenant booking a Vendor tenant's center) are handled through explicit Booking Partnerships with their own permission rules.

#### 3.4 Constraints and assumptions

- Keep the MERN stack (Node 20+, MongoDB 6+, React + Vite + Tailwind). Add Redis for queues, cache and rate limiting.
- Backward compatibility: existing data MUST migrate into a default tenant with no loss.
- Currency and tax default to INR and GST; both configurable per tenant.
- Payment gateway: Razorpay first, Stripe pluggable behind an adapter interface.
### 4. System Architecture (target)

- API: Express, versioned under /api/v1, OpenAPI 3 documented, JWT access plus refresh tokens.
- Tenant resolution: by subdomain (acme.examhub.app), custom domain, or X-Tenant header for API keys.
- Jobs: BullMQ on Redis for email, SMS, invoice generation, report exports, reminders, webhook delivery.
- Storage: S3-compatible abstraction for candidate files, logos, invoices, exports.
- Realtime: Socket.IO or SSE for live attendance and notifications.
- Observability: structured logs (pino), metrics endpoint, Sentry-compatible error hook, health and readiness endpoints.
- Deployment: Dockerfiles, docker-compose for local, GitHub Actions CI (lint, test, build, docker image).
### 5. Existing Functional Baseline (MUST be preserved)

| ID | Requirement |
|---|---|
| BL-01 | Online and offline booking workflows and status machine exactly as in README section 1.1 |
| BL-02 | Seat-level lab allocation with time-overlap checks, maintenance blocks, buffer seats, working-system counts |
| BL-03 | Auto-suggest allocation (tightest single lab, else largest first) |
| BL-04 | Per-center-and-date serialised allocation saves to prevent overbooking |
| BL-05 | Candidate CSV upload, automatic seat plan, printable seat list and CSV |
| BL-06 | Attendance and exam start only on exam date; lab-wise attendance by agency |
| BL-07 | Mock day workflow for online exams |
| BL-08 | Readiness checklists (network; center plus strong room and answer sheets) |
| BL-09 | Lab utilization report with CSV export |
| BL-10 | Incident log (high severity notifies everyone), center rating |
| BL-11 | Billing per seat with invoice and payment status; booking CSV export |
| BL-12 | In-app notifications with optional SMTP email |
| BL-13 | Institute self-registration with approval |

All baseline tests MUST keep passing after tenancy changes (tests updated to run inside a test tenant).

### 6. New SaaS Requirements

#### 6.1 Multi-tenancy and onboarding

| ID | Requirement |
|---|---|
| SAAS-001 | MUST add a Tenant model (name, slug, type(s), status: trial/active/suspended/cancelled, plan, branding, settings, createdAt). |
| SAAS-002 | MUST add tenantId to all tenant-owned collections and enforce it through a central query-scoping layer (mongoose plugin or repository wrapper). Direct unscoped queries MUST fail lint or tests. |
| SAAS-003 | MUST provide public self-service signup: create tenant, first Tenant Admin, email verification, 14-day free trial (configurable). |
| SAAS-004 | MUST provide a guided onboarding wizard: profile, add centers, labs/halls, invite users, sample booking. |
| SAAS-005 | MUST provide a Platform Owner console: list/search tenants, impersonate (audited, time-limited), suspend/reactivate, change plan, view usage. |
| SAAS-006 | MUST resolve tenant by subdomain; SHOULD support verified custom domains with automatic TLS guidance. |
| SAAS-007 | MUST provide migration script moving existing data to a default tenant, idempotent and reversible in dev. |
| SAAS-008 | MUST allow tenant data export (JSON/CSV zip) and tenant deletion with 30-day grace period. |
| SAAS-009 | SHOULD allow white-label branding: logo, colours, email sender name, login page text. |
| SAAS-010 | MAY support data residency flag per tenant (informational in v1). |

#### 6.2 Plans, subscriptions and billing

| ID | Requirement |
|---|---|
| BILL-001 | MUST define plans in configuration or database: Free/Trial, Starter, Growth, Enterprise, each with limits (centers, labs, users, bookings per month, candidates per month, storage, API calls) and feature flags. |
| BILL-002 | MUST enforce limits server-side with clear error codes (PLAN_LIMIT_REACHED) and UI upgrade prompts. |
| BILL-003 | MUST integrate a payment gateway adapter (Razorpay first) for recurring subscriptions, monthly and annual, with proration on upgrade. |
| BILL-004 | MUST handle gateway webhooks idempotently: payment success, failure, renewal, cancellation. |
| BILL-005 | MUST implement dunning: retry reminders, grace period, then downgrade or suspend. |
| BILL-006 | MUST generate GST-compliant platform invoices (PDF) with tenant billing details; invoice history downloadable. |
| BILL-007 | SHOULD support usage-based add-ons (extra candidates, SMS packs) with metering and overage invoices. |
| BILL-008 | SHOULD support coupons and referral credits. |
| BILL-009 | MUST keep existing per-seat center billing (BL-11) as a separate tenant-to-tenant ledger, distinct from platform subscription billing. |
| BILL-010 | SHOULD support Stripe through the same adapter interface. |

#### 6.3 Access control and security

| ID | Requirement |
|---|---|
| SEC-001 | MUST implement permission-based RBAC (resource + action), with the existing roles as editable templates and tenant-defined custom roles. |
| SEC-002 | MUST support optional TOTP MFA per user; Tenant Admin MAY enforce MFA for all users. |
| SEC-003 | SHOULD support SSO via OIDC/SAML for Enterprise plan (Google, Microsoft Entra). |
| SEC-004 | MUST add rate limiting, brute-force lockout, secure headers (helmet), strict CORS, input validation (zod or joi) on every route. |
| SEC-005 | MUST hash passwords with argon2 or bcrypt (cost configurable), rotate refresh tokens, support session listing and revocation. |
| SEC-006 | MUST write an immutable audit log (who, what, when, IP, before/after) for bookings, allocations, billing, role changes, impersonation, exports. Tenant-visible, filterable, exportable. |
| SEC-007 | MUST encrypt sensitive fields at rest (candidate ID numbers, phone) and secrets via environment or secret manager. |
| SEC-008 | MUST comply with India DPDP Act basics: consent capture, data retention settings, deletion and export requests. |
| SEC-009 | MUST pass OWASP Top 10 checklist; dependency audit in CI. |

#### 6.4 Developer platform and integrations

| ID | Requirement |
|---|---|
| INT-001 | MUST publish versioned REST API with OpenAPI docs and Swagger UI. |
| INT-002 | MUST support tenant-scoped API keys with scopes and rotation (Growth and above). |
| INT-003 | MUST support outbound webhooks with HMAC signature, retries with backoff, delivery log, for events such as booking.requested, booking.confirmed, exam.started, exam.completed, attendance.recorded, incident.created, invoice.paid. |
| INT-004 | SHOULD provide integrations: Razorpay, SMS (MSG91 or Twilio), WhatsApp Business, SMTP/SES, Google Calendar and iCal feed, Google Maps for center location. |
| INT-005 | MAY provide hooks for external CBT engines and proctoring vendors (launch URL, result callback). |

### 7. New Product Features (beyond SaaS)

#### 7.1 Booking marketplace and availability

| ID | Requirement |
|---|---|
| BOOK-001 | MUST provide a public (opt-in per center) directory: search by city, capacity, online/offline, facilities, rating, price. |
| BOOK-002 | MUST show an availability calendar per center showing free seats per shift, respecting maintenance blocks and existing allocations. |
| BOOK-003 | MUST support temporary slot hold (default 30 min) while the institute completes the request; hold expires automatically via job. |
| BOOK-004 | MUST support instant quote (seats x rate + tax + extras) and optional advance payment through the gateway; refund rules per cancellation policy. |
| BOOK-005 | SHOULD support multi-center bookings (one exam spread over several centers with automatic candidate split by city or capacity). |
| BOOK-006 | SHOULD support recurring exam series (weekly or monthly mock tests) and bulk reschedule. |
| BOOK-007 | SHOULD support waitlist: auto-notify and auto-promote when seats free up. |
| BOOK-008 | SHOULD allow centers to define pricing rules: peak dates, weekend surcharge, volume discounts. |
| BOOK-009 | MUST support cancellation and rescheduling with configurable policy windows and fees. |
| BOOK-010 | SHOULD provide smart allocation optimisation across centers minimising candidate travel (uses candidate city/pincode). |

#### 7.2 Candidate portal and exam day

| ID | Requirement |
|---|---|
| CAND-001 | MUST provide a candidate login (OTP via mobile/email) showing assigned exams, center address with map, shift time, seat number. |
| CAND-002 | MUST generate admit cards (PDF) with photo, QR code, instructions; bulk generation per booking; email/SMS/WhatsApp delivery. |
| CAND-003 | MUST support QR-based check-in by invigilator via mobile web (camera scan), writing to attendance in real time, with manual fallback. |
| CAND-004 | SHOULD support candidate photo and ID capture/verification at check-in and duplicate or impersonation flags. |
| CAND-005 | SHOULD support candidate city-preference and slot-preference collection forms configured by institute. |
| CAND-006 | SHOULD support special accommodations (scribe, extra time, wheelchair access) flagged to allocation so such candidates get suitable seats. |
| CAND-007 | MUST send automated reminders (T-7, T-1 days, T-2 hours) and change alerts. |
| CAND-008 | MAY provide candidate grievance form linked to incident log. |

#### 7.3 Operations and center management

| ID | Requirement |
|---|---|
| OPS-001 | MUST provide a staff roster per booking: invigilators, technical staff, with assignment, acceptance, and duty attendance. |
| OPS-002 | SHOULD provide asset and system inventory per lab (system ID, specs, status) with per-exam fault reporting and automatic working-system count update. |
| OPS-003 | SHOULD provide a live exam-day command view: real-time check-in count, lab status, incidents, with websocket updates. |
| OPS-004 | SHOULD provide photo/evidence upload for checklists and incidents (S3). |
| OPS-005 | MUST support incident workflow: open, assigned, resolved, with SLA timers and escalation. |
| OPS-006 | SHOULD provide center compliance documents (fire safety, internet speed test, power backup) with expiry reminders. |
| OPS-007 | SHOULD provide offline-tolerant attendance capture for low-network venues (PWA queue, sync later with conflict rules). |
| OPS-008 | MAY provide network speed test results attached to the network checklist. |

#### 7.4 Analytics and reporting

| ID | Requirement |
|---|---|
| RPT-001 | MUST extend dashboards per role with tenant-level KPIs: bookings by status, revenue, utilization %, attendance %, incident rate, rating. |
| RPT-002 | MUST provide scheduled and on-demand reports (CSV, XLSX, PDF): utilization, revenue, attendance, GST summary, agency performance, center comparison. |
| RPT-003 | SHOULD provide platform-level analytics for the Owner: MRR, churn, trial conversion, usage per plan. |
| RPT-004 | SHOULD provide demand forecasting hints (peak dates per center based on history). |
| RPT-005 | SHOULD provide an exam post-mortem report per exam (timeline, no-show rate, incidents, system failures). |

#### 7.5 Communication

| ID | Requirement |
|---|---|
| COM-001 | MUST provide template-based notifications (email, SMS, WhatsApp, in-app) editable per tenant with variables and preview. |
| COM-002 | MUST provide per-user notification preferences and quiet hours except critical alerts. |
| COM-003 | SHOULD provide bulk announcements to a booking's candidates or staff. |
| COM-004 | SHOULD provide in-app comments and mentions on a booking, replacing offline coordination. |

#### 7.6 Platform experience

| ID | Requirement |
|---|---|
| UX-001 | MUST be responsive and installable as a PWA. |
| UX-002 | SHOULD support i18n with English, Hindi and Gujarati at launch; RTL ready. |
| UX-003 | SHOULD support dark mode and WCAG 2.1 AA accessibility. |
| UX-004 | SHOULD provide global search, saved filters, and bulk actions in lists. |
| UX-005 | SHOULD provide in-app help centre, product tour and support ticket form (Platform Support queue). |

### 8. Data Model Changes

New collections: Tenant, Plan, Subscription, PlatformInvoice, PaymentEvent, Permission/RoleDefinition, ApiKey, Webhook, WebhookDelivery, AuditLog, BookingPartnership, SlotHold, WaitlistEntry, PricingRule, CandidateAccount, AdmitCard, CheckInEvent, StaffAssignment, LabAsset, ComplianceDocument, NotificationTemplate, SupportTicket, FileObject, UsageMeter.

Modified collections: every existing collection gains tenantId (indexed, compound with common lookup keys); Booking gains holdId, paymentStatus, policyId, seriesId; Candidate gains accommodations, city, photoRef, consent; User gains tenantId, roleIds, mfa, locale.

Indexes: unique compound indexes must include tenantId (for example {tenantId, email}); allocation conflict queries index {tenantId, centerId, date, shift}.

### 9. Representative API Surface (/api/v1)

- POST /auth/signup-tenant, /auth/login, /auth/refresh, /auth/mfa/verify, /auth/candidate/otp
- GET/PATCH /tenant, /tenant/branding, /tenant/domains
- GET /plans, POST /subscription/checkout, POST /subscription/cancel, POST /webhooks/razorpay
- GET /centers/public, GET /centers/:id/availability, POST /bookings/hold, POST /bookings
- Existing booking, allocation, checklist, attendance, incident, billing, utilization routes retained and tenant-scoped
- POST /candidates/import, GET /bookings/:id/admit-cards, POST /checkin/scan
- GET /audit-logs, GET/POST /api-keys, GET/POST /webhooks
- GET /reports/:type?format=csv|xlsx|pdf
- /platform/* routes restricted to Platform roles

All lists MUST support pagination, sorting and filtering. Errors use a standard envelope {code, message, details}.

### 10. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Performance: p95 API latency under 500 ms for standard reads at 100 concurrent users; allocation save under 2 s for 2,000 seats. |
| NFR-02 | Scale: support 500 tenants, 5,000 centers, and 100,000 candidates per exam day on a horizontally scalable API. |
| NFR-03 | Availability: 99.9% monthly target; zero-downtime deploys; health and readiness probes. |
| NFR-04 | Data integrity: no double allocation under concurrent writes (retain serialisation, move lock to Redis or Mongo transactions for multi-instance). |
| NFR-05 | Backup: daily automated backups, 30-day retention, documented restore drill. |
| NFR-06 | Security: tenant isolation tests must prove no cross-tenant read or write on every route. |
| NFR-07 | Testability: minimum 80% coverage on services; API tests for each route; Playwright E2E for core flows. |
| NFR-08 | Maintainability: ESLint, Prettier, conventional commits, Husky pre-commit, ADRs for major decisions. |
| NFR-09 | Compatibility: latest two versions of Chrome, Edge, Firefox, Safari; Android Chrome and iOS Safari. |
| NFR-10 | Time handling: store UTC, display in tenant time zone (default Asia/Kolkata). |

### 11. Phased Delivery Plan with Acceptance Criteria

Phase 0 - Foundation (read and harden). Read the entire repo; write docs/ARCHITECTURE.md; add Docker, CI, Prettier, env validation, OpenAPI skeleton. Accept: CI green, app starts via docker-compose, all existing tests pass.

Phase 1 - Multi-tenancy. SAAS-001 to 008, SEC-001, SEC-004 to 006, migration. Accept: two seeded tenants cannot see each other's data on any route (automated test per route); existing demo logins still work inside the default tenant.

Phase 2 - Plans and billing. BILL-001 to 006, BILL-009. Accept: trial signup, Razorpay test-mode subscription, limit enforcement, invoice PDF, webhook idempotency test.

Phase 3 - Booking marketplace. BOOK-001 to 004, 007, 009. Accept: two users cannot hold the same seats; hold expires; payment confirms booking; cancellation fee calculated per policy.

Phase 4 - Candidate portal and exam day. CAND-001 to 003, 007, OPS-001, 003, 005. Accept: admit cards generated in bulk for 5,000 candidates under 2 minutes; QR check-in updates live dashboard.

Phase 5 - Integrations and developer platform. INT-001 to 004, COM-001 to 002, SEC-002. Accept: API key call succeeds within scope only; webhook retries and signature verified; MFA login works.

Phase 6 - Analytics, polish, hardening. RPT-001 to 003, UX-001 to 002, SEC-007 to 009, NFR tests. Accept: load test meets NFR-01; security checklist signed off; E2E suite green.

Phase 7 (optional). BOOK-005, 006, 008, 010, CAND-004 to 006, OPS-002, 006, 007, RPT-004, SEC-003.

### 12. Instructions for Devin AI

- Work on a new branch per phase; open one pull request per phase with a summary, test evidence and migration notes.
- Before coding, read all files under server/src and client/src, list differences from section 1 of this SRS, and update this analysis if the code disagrees with the README.
- Never break baseline requirements BL-01 to BL-13; run npm run lint, npm test, npm run build before each commit.
- Implement tenant scoping first; no feature may ship without a cross-tenant isolation test.
- Put all secrets in environment variables; add every new variable to .env.example with comments.
- Keep the service-layer pattern (routes thin, logic in src/services), and add unit tests for each new service.
- Update the seed script to create two demo tenants, a platform owner, sample plans, sample candidates and a sample public center.
- Document every endpoint in OpenAPI and keep README current (setup, env, scripts, architecture, role matrix).
- If a requirement is ambiguous, choose the simplest option, record it in docs/DECISIONS.md, and continue.
- Do not store card data; use gateway-hosted checkout only.
### 13. Role Permission Matrix (summary)

| Capability | Platform Owner | Tenant Admin | Institute | Vendor | Network Admin | Center In-Charge | Agency | Invigilator | Candidate |
|---|---|---|---|---|---|---|---|---|---|
| Manage tenants and plans | Yes | No | No | No | No | No | No | No | No |
| Manage tenant users and roles | Impersonate | Yes | No | No | No | No | No | No | No |
| Request booking | No | Yes | Yes | No | No | No | No | No | No |
| Allocate labs (online) | No | Yes | No | Verify | Yes | No | No | No | No |
| Allocate halls (offline) | No | Yes | Verify | No | No | Yes | No | No | No |
| Complete checklists | No | Yes | No | No | Network | Center | No | No | No |
| Start exam, mark attendance | No | Yes | View | View | View | View | Yes | Check-in | No |
| Billing and invoices | Platform | Yes | View own | Yes | No | No | No | No | No |
| View own admit card and seat | No | No | No | No | No | No | No | No | Yes |
| Audit log and API keys | Platform | Yes | No | No | No | No | No | No | No |

### 14. Open Questions for the Product Owner

- Final plan names, prices and limits.
- Whether candidate data is entered by institutes only or also self-registered.
- Preferred SMS/WhatsApp provider in India.
- Whether custom domains are needed at launch.
- Hosting target (AWS, Azure, DigitalOcean, or on-prem for universities).