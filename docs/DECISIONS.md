# Decisions

Simplest-option choices made where the SRS is open (SRS section 12).

1. **One PR per SRS phase**, starting with Phase 0 (foundation), then Phase 1 (multi-tenancy).
2. **`/api/v1` is an alias of `/api`** for now, so the existing client keeps working; new endpoints are documented under `/api/v1`.
3. **Prettier is configured but not enforced in CI yet**, to avoid a whole-repo reformat mixed with feature work. `npm run format:check` is available; enforcement can be switched on in a formatting-only PR.
4. **Redis is not added in Phase 0.** It arrives with the first feature that needs it (queues / slot holds in Phases 2–3). The Mongo `LabLock` keeps allocation saves serialised until then.
5. **Dependency audit in CI reports high/critical issues** (`npm audit --audit-level=high`).
6. **Product owner answers to SRS section 14 (26 Nov 2026):**
   - Candidate data is entered by institutes only; no candidate self-registration.
   - **No candidate portal** — this is a booking system. CAND-001 to CAND-008 (candidate login, admit cards, QR check-in, candidate reminders, preference forms, grievances), `CandidateAccount` / `AdmitCard` / `CheckInEvent` collections, `/auth/candidate/otp`, `/admit-cards`, `/checkin/scan` and the Candidate column of the role matrix are out of scope. Existing candidate CSV upload and seat plan (BL-05) stay.
   - SMS / WhatsApp integration is not required (INT-004 SMS/WhatsApp, COM-001 SMS/WhatsApp channels and SMS packs in BILL-007 are dropped; email + in-app remain).
   - Hosting and custom domains are handled by the product owner; the app stays host-neutral (Docker + env variables, tenant resolution configurable).
   - Razorpay test keys will be provided for Phase 2; until then a mock gateway adapter is used in tests.
   - Plan names, prices and limits: still open; placeholder Free / Starter / Growth / Enterprise will be used.
7. **Counts only, no candidate details** (product owner, 26 Nov 2026): candidate CSV upload, name list, seat plan and seat-number printouts are removed (supersedes SRS BL-05). Bookings carry only the total candidates per shift; on exam day the agency records present per classroom; absent = allocated − present, rolled up per Lab `block` and per center (`GET /reports/attendance`).
8. **Phase 1 multi-tenancy design:**
   - **Shared database, `tenant` field on every tenant-owned collection** (User, Organization, Center, Lab, LabAllocation, Booking, Notification, AuditLog). A Mongoose plugin (`server/src/tenancy/plugin.js`) adds the field, filters every query/aggregate by the current tenant and stamps it on save; the tenant comes from an `AsyncLocalStorage` context set by `requireAuth`. A tenant-owned query outside a context **throws** (`Unscoped … query`) instead of returning other tenants' data. Login, sign-up, the platform console, seeds and migrations opt out explicitly with `asPlatform()`.
   - **Email is globally unique** (one account = one tenant), so login needs no tenant picker. The tenant is taken from the account; a subdomain (`TENANT_BASE_DOMAIN`) or `X-Tenant` header that names another tenant is rejected.
   - **Existing Super Admin acts as Tenant Admin** inside its tenant; new **Platform Owner** role (no tenant) manages tenants only and cannot open tenant booking routes.
   - **Impersonation** issues a 30-minute token for the tenant's first active Super Admin, requires a reason and is written to that tenant's audit log; every action in the session is tagged `impersonatedBy`.
   - **Audit log**: every successful write request is recorded (actor, role, IP, path, redacted body), plus explicit before/after entries for user role/status changes, tenant settings, platform status/plan changes and impersonation. Entries cannot be updated or deleted through the model.
   - **Tenant deletion** sets status `cancelled` with `deletionScheduledAt` = +30 days (platform owner can reactivate before then); the purge job comes with Phase 6 retention work.
   - **Deferred to later phases:** email verification at sign-up (needs SMTP; Phase 5 with COM-001), trial-expiry enforcement and plan limits (Phase 2 billing), SEC-001 permission matrix and custom roles (permissions stay role-based for now), SEC-005 refresh tokens / session list.
   - **Counters** (booking numbers) are per tenant: `_id = <tenantId>:booking-<year>`; booking numbers and center codes are unique per tenant.
9. **Booking Vendor removed; the agency creates exams** (product owner, 27 Nov 2026):
   - The `booking_vendor` role, `vendor` organization kind and center vendor field are removed. The SRS and gap-analysis documents still mention the vendor as originally written.
   - The Exam Conducting Agency creates the exam: institute, center, mode, dates/shifts and candidate count per shift. Institutes no longer create bookings; they see status, allocation, counts and utilization.
   - Network Admin (online labs) and Center In-Charge (offline classrooms) allocate; a complete allocation sets the booking to `confirmed` with no verification step. `POST /bookings/:id/review` and `POST /bookings/:id/mock/permission` are removed; a fully allocated mock day is `approved` directly.
   - Editing, cancelling, billing and mock-day requests belong to the creating agency (and Super Admin). Only Super Admin can reassign the agency.
   - Tenant sign-up types are `center`, `institute` and `agency`. Existing databases: run `npm run migrate:remove-vendor -w server`.
