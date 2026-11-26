# SRS section 1 reconciled with the code

Checked against `server/src` and `client/src` at the start of Phase 0 (after PR #2). Items the SRS lists as gaps are marked **present**, **partial** or **absent**.

| Area | SRS says | Code today |
|---|---|---|
| Tenancy | No tenant isolation | **Absent.** `Organization` (`kind`: institute / vendor / agency) and role scoping in `services/access.js` (`bookingScope`, `centerScope`) give per-organization visibility, but there is no `tenantId` or tenant model. These map directly to SRS tenant types. |
| Roles | Fixed roles | **Present, fixed.** 6 roles in `models/roles.js`; permissions are code rules in `services/workflow.js` (`denyReason`). No custom roles. |
| Rate limiting | Not confirmed | **Partial.** `express-rate-limit` on `/auth/login` and `/auth/register-institute` only; `TRUST_PROXY` setting. |
| Secure headers / CORS | Not confirmed | **Present.** `helmet`, CORS allowlist from `CLIENT_ORIGIN`. |
| Input validation | Not confirmed | **Present.** `zod` on every write route. |
| Passwords / sessions | Not confirmed | **Partial.** bcrypt hashing; single JWT (no refresh token); tokens are invalidated after a password change (`passwordChangedAt` / `pwv`). No session listing, MFA or SSO. |
| Audit | No audit trail | **Partial.** Per-booking `timeline` (who, what, when). No global, immutable audit log, IP or before/after. |
| Commercials | No subscriptions | **Absent** for the platform. Per-seat booking billing (rate, amount, invoice no., payment status) exists = SRS BL-11 ledger. |
| Booking | No public discovery, calendar, holds, payment | **Partial.** Authenticated center list, per-center availability and schedule endpoints, allocation suggestions. No public directory, holds, quotes with tax, or payments. |
| Candidates | No portal, admit card, QR | **Absent** beyond CSV import / export and seat plan. |
| Operations | No SMS, storage, queue | **Absent.** In-app notifications + optional SMTP, sent inline. |
| Platform | No API keys, webhooks, i18n, observability, Docker, CI | **Absent** before Phase 0. Phase 0 adds Docker, CI, OpenAPI, `/api/v1`, health and readiness. |
| Docs | No OpenAPI | Phase 0 adds `server/openapi.yaml` and Swagger UI at `/api/docs`. |

Baseline BL-01 to BL-13 are all implemented and covered by `server/test` (24 tests).
