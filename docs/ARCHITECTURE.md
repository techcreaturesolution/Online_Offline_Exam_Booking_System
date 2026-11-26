# Architecture

```
client/  React 19 + Vite + Tailwind SPA (role-aware pages, Axios client with JWT)
server/  Express 5 API + Mongoose 9 (MongoDB)
  src/config      env loading and production checks
  src/middleware  auth (JWT, role guard), errors
  src/models      User, Organization, Center, Lab, Booking (shifts, readiness, mock day, incidents,
                  billing, timeline), LabAllocation (seat ranges, lab-wise attendance), Candidate,
                  Notification, Counter, LabLock
  src/routes      auth, admin, bookings, centers, reports, notifications, meta (thin HTTP layer)
  src/services    workflow (status machine + permission rules), access (query scoping),
                  allocation (availability, suggestions, locked saves, seat ranges), seatPlan,
                  utilization, notify
  scripts/        seed-demo.js
  test/           node:test unit + API tests against a local MongoDB
docs/            SRS, gap analysis, decisions, roadmap
```

**Request flow:** route → zod validation → `loadBooking` (scoped by `bookingScope`) → `assertAllowed(action)` (`workflow.denyReason`) → service → save + timeline event → `notifyBooking`.

**Allocation integrity:** `saveAllocation` runs availability → `validatePlan` → `firstFreeRange` inside `withLocks(['<center>:<date>'])` (a `LabLock` document with a unique `_id`). This works on a standalone MongoDB; for multi-instance deployments the lock can move to Redis (SRS NFR-04).

**API:** served under `/api` and `/api/v1` (same routers). OpenAPI 3 at `server/openapi.yaml`, Swagger UI at `/api/docs`. Probes: `/api/health` (liveness) and `/api/health/ready` (MongoDB connected).

**Deployment:** `Dockerfile` builds the client and serves `client/dist` from the API; `docker-compose.yml` runs the app with MongoDB. CI in `.github/workflows/ci.yml`.
