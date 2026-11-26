# Decisions

Simplest-option choices made where the SRS is open (SRS section 12).

1. **One PR per SRS phase**, starting with Phase 0 (foundation), then Phase 1 (multi-tenancy).
2. **`/api/v1` is an alias of `/api`** for now, so the existing client keeps working; new endpoints are documented under `/api/v1`.
3. **Prettier is configured but not enforced in CI yet**, to avoid a whole-repo reformat mixed with feature work. `npm run format:check` is available; enforcement can be switched on in a formatting-only PR.
4. **Redis is not added in Phase 0.** It arrives with the first feature that needs it (queues / slot holds in Phases 2–3). The Mongo `LabLock` keeps allocation saves serialised until then.
5. **Dependency audit in CI reports high/critical issues** (`npm audit --audit-level=high`).
6. **Product owner answers to SRS section 14 (26 Nov 2026):**
   - Candidate data is entered by institutes only; no candidate self-registration (CAND-005 preference forms and self-signup are out of scope).
   - SMS / WhatsApp integration is not required (INT-004 SMS/WhatsApp, COM-001 SMS/WhatsApp channels and SMS packs in BILL-007 are dropped; email + in-app remain).
   - Hosting and custom domains are handled by the product owner; the app stays host-neutral (Docker + env variables, tenant resolution configurable).
   - Razorpay test keys will be provided for Phase 2; until then a mock gateway adapter is used in tests.
   - Plan names, prices and limits: still open; placeholder Free / Starter / Growth / Enterprise will be used.
