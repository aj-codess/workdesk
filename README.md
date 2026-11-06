# WorkDesk

A single-tenant helpdesk and service-request platform. Employees raise tickets, department managers triage and assign them, agents resolve them, auditors have read-only access. Roles and permissions are fully dynamic: an administrator can create roles, change their permissions and assign several roles to a user, and the change applies on the user's next request.

**Stack:** Next.js 15 (App Router route handlers) · TypeScript · Prisma 6.19 · PostgreSQL 16 · JWT access token + rotating refresh token (httpOnly cookie) with server-side sessions.

This repository currently contains the **backend**. The frontend is built separately and integrated afterwards.

## Quick start (local)

**Requirements:** Node 20.9+ (22 recommended), npm 10+, Docker (or your own PostgreSQL 16).

```bash
# 1. Install (also runs `prisma generate`)
npm install

# 2. Configure
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   -> paste the output into JWT_ACCESS_SECRET in .env
#   -> for demo data, set SEED_DEMO=true in .env

# 3. Database
npm run db:up                                   # PostgreSQL in Docker; wait until healthy... you can skip when not using docker
npx prisma migrate dev --name init
npx prisma migrate dev --create-only --name db_hardening
#   paste prisma/sql/db_hardening.sql into the new
#   prisma/migrations/<timestamp>_db_hardening/migration.sql, then:
npx prisma migrate dev                          # applies it; run once more, it must say "in sync"

# 4. Seed (permissions, 5 system roles, first admin, optional demo data)
npm run prisma:seed

# 5. Run
npm run dev                                     # http://localhost:4000
curl http://localhost:4000/api/health/ready     # {"success":true,...,"database":"up"}
```

The hardening migration adds what Prisma cannot model: CHECK constraints, the one-current-assignment unique index, the search index and the append-only trigger on `audit_logs`. Do not skip it.

Delete these leftovers from the old NestJS layout if they are still present: `nest-cli.json`, `server.ts`, `tsconfig.build.json`.

## Sign in

| Persona | Email | Password |
|---|---|---|
| System Administrator | `admin@workdesk.local` | `SEED_ADMIN_PASSWORD` (default `ChangeMe-Admin-123`) |
| Support Manager (IT) | `manager.it@workdesk.local` | `Workdesk#Demo1` |
| Support Agent (IT) | `agent.it@workdesk.local` | `Workdesk#Demo1` |
| Employee | `employee@workdesk.local` | `Workdesk#Demo1` |
| Auditor (read-only) | `auditor@workdesk.local` | `Workdesk#Demo1` |

Only the admin exists unless `SEED_DEMO=true`. Demo seeding is refused in production. Change the default passwords for any shared environment.

```bash
curl -i -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@workdesk.local","password":"ChangeMe-Admin-123"}'
```
The response body holds the access token (send it as `Authorization: Bearer <token>`, lifetime 15 min). The refresh token arrives as an HttpOnly cookie scoped to `/api/auth`.

## Try the API with Postman

Import `postman_bundle/workdesk.postman_collection.json` and `workdesk.local.postman_environment.json`, select the environment, run folder `00 Setup`, then the other folders in order (skip `07 Attachments`, which needs you to pick a file). See `postman_bundle/README.md`.

## Environment variables

Copy `.env.example`; the important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | 32+ random characters. The app refuses to boot with the placeholder |
| `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `SESSION_MAX_DAYS` | Token and session lifetimes (900 s, 7 d, 30 d) |
| `COOKIE_SECURE` | `false` locally over http. **Must be `true` in production** (enforced) |
| `FRONTEND_URL`, `CORS_ORIGINS` | Allowed browser origins (comma separated, never `*`) |
| `TRUST_PROXY` | `true` only behind a reverse proxy that overwrites `X-Forwarded-For` |
| `UPLOAD_DIR` | Where attachments are stored (a persistent volume in production) |
| `SMTP_URL`, `MAIL_FROM` | Optional. Without SMTP in development the reset link is printed in the server log |
| `CRON_SECRET` | Enables `POST /api/internal/housekeeping`; unset = that route answers 404 |
| `SEED_ADMIN_*`, `SEED_DEMO`, `SEED_DEMO_PASSWORD` | First admin and optional demo data |

## Project layout

```
src/app/api/**/route.ts   HTTP entry points (method, permissions, rate limit)
src/middleware/           rate limit -> authenticate (JWT + live session) -> permission check
src/controller/           validate input, orchestrate, shape the response
src/models/               ALL database calls (Prisma): scope, state machine, transactions, audit
src/service/              non-DB work: JWT, argon2, mail, file storage, CSV, rate-limit store
src/validators/           zod schemas
src/utilities/            domain errors, response envelope, request helpers, mappers, logger
src/config/               validated env, permission catalogue, settings, rate-limit rules
prisma/                   schema, seed, hardening SQL
tests/e2e/                end-to-end scenarios
docs/                     API_ROUTES.md (full route contract), BACKEND_SETUP.md, deliveries
```
A controller never calls Prisma; a model never touches HTTP.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` | Dev server, production build, production server (port 4000) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | End-to-end scenarios against a running server |
| `npm run db:up` / `db:down` | Start / stop the Docker database |
| `npm run prisma:migrate` / `prisma:deploy` / `prisma:seed` / `prisma:studio` | Prisma helpers |

## Tests

The suite drives a live server and covers the eight assignment scenarios and the security behaviour behind them (IDOR, privilege escalation, last-admin protection, token rotation and reuse, lockout, rate limits, upload checks).

```bash
SEED_DEMO=true npm run prisma:seed
TRUST_PROXY=true npm run dev          # in one terminal
npm run test:e2e                      # in another (E2E_BASE_URL defaults to http://localhost:4000)
```
Run it against a development database only: it creates users and roles and temporarily deactivates other administrators.

## Production

```bash
docker compose --profile app up --build     # db, one-off migrate + seed, then the API on :4000
```
Checklist (details in `docs/BACKEND_SETUP.md`):
- Strong `JWT_ACCESS_SECRET`, `COOKIE_SECURE=true`, exact `CORS_ORIGINS`.
- Serve frontend and API on the same site (for example `app.example.com` and `api.example.com`); the refresh cookie is `SameSite=Strict`.
- Behind a proxy: `TRUST_PROXY=true`, otherwise all clients share one rate-limit bucket.
- Apply migrations with `npx prisma migrate deploy`, never `migrate dev`. Commit the `prisma/migrations` folder.
- Rate limiting is in memory per instance; for several instances move it to Redis or the edge.
- Schedule `POST /api/internal/housekeeping` daily with `Authorization: Bearer $CRON_SECRET`.
- Back up PostgreSQL and `UPLOAD_DIR` together.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` / `Unsafe production configuration` at start | Fix the variables the message lists |
| `P1001: Can't reach database server` | `npm run db:up`, wait for healthy, check the port in `DATABASE_URL` |
| `Failed to fetch the engine file ... 403` on `prisma generate` | A firewall blocks `binaries.prisma.sh`; use another network |
| Login works but refresh never happens | Frontend and API are different sites, or `COOKIE_SECURE=true` over plain http |
| Everything returns 429 in production | Set `TRUST_PROXY=true` behind your proxy |
| Seeded users cannot sign in | They must be `ACTIVE` (the seed sets it); check `SEED_DEMO=true` was used |
| `401 TOKEN_EXPIRED` | Access tokens last 15 min: log in again or call `POST /api/auth/refresh` |

Full route list with request bodies: `docs/API_ROUTES.md`.