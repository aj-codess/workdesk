# WorkDesk Backend: Setup Guide

Next.js 15 (App Router route handlers) · TypeScript 5.9 · Prisma 6.19 · PostgreSQL 16.
Route contract: `docs/API_ROUTES.md`. Design: `docs/architecture.md` (its NestJS wording is superseded by this file).

## Request flow

```
src/app/api/**/route.ts      HTTP entry. Declares method, permissions, rate limit via publicRoute / protectedRoute
  -> src/middleware/*        rate limit -> authenticate (JWT + live session + ACTIVE user) -> permission check
  -> src/controller/*        parse + validate (src/validators, zod .strict()), orchestrate, shape the response
  -> src/models/*            ALL database calls (Prisma): scope, state machine, transactions, audit rows
  -> src/service/*           external / non-DB work: JWT, argon2, mail, file storage, CSV, rate-limit store
src/utilities/*              errors, response envelope, cookies, request meta, mappers
src/config/*                 env (validated), permissions catalogue, settings whitelist, rate-limit rules
src/middleware.ts            edge CORS for the separate frontend origin
src/instrumentation.ts       fails the process at boot on an invalid or unsafe production configuration
```

A controller never calls Prisma. A model never touches HTTP.

## Prerequisites

Node 20.9+ (22 recommended), npm 10+, Docker (for the bundled Postgres) or your own PostgreSQL 16.

## 1. Install

```bash
npm install            # postinstall runs `prisma generate`
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste into JWT_ACCESS_SECRET
```
Prisma is pinned to 6.19.x because the schema keeps `url = env("DATABASE_URL")` in the datasource block. Do not run `npm install prisma@latest`.
Never commit `.env`.

## 2. Database and migrations

```bash
npm run db:up                                   # Postgres 16 in Docker, wait for "healthy"
npx prisma migrate dev --name init
npx prisma migrate dev --create-only --name db_hardening
# paste prisma/sql/db_hardening.sql into the new migrations/<timestamp>_db_hardening/migration.sql
npx prisma migrate dev                          # applies it
npx prisma migrate dev                          # second run must report "in sync"
```
The hardening migration adds what Prisma cannot model: CHECK constraints, the one-current-assignment partial unique index, the trigram search index and the append-only trigger on `audit_logs`. If the last `migrate dev` proposes dropping any of them, stop and tell me.

## 3. Seed

```bash
npm run prisma:seed
```
Idempotent. Creates the permission catalogue, the five system roles (System Administrator, Support Manager, Support Agent, Employee, Auditor (read-only)) with their default bundles, and the first administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Role bundles are written only when a role is first created, so later edits in the UI are never overwritten; the System Administrator always receives any new catalogue key.
`SEED_DEMO=true` also creates demo departments, categories and one user per role (password `SEED_DEMO_PASSWORD`). It is refused when `NODE_ENV=production`.

## 4. Run

```bash
npm run dev            # http://localhost:4000
curl localhost:4000/api/health/ready
```

## 5. Tests

The end-to-end suite drives a LIVE server and covers the eight assignment scenarios plus the security properties behind them (IDOR, escalation, last-admin, token rotation and reuse, lockout, rate limits, upload checks, report scope, CSV injection).

```bash
SEED_DEMO=true npm run prisma:seed
TRUST_PROXY=true npm run dev          # tests give each client its own X-Forwarded-For address
npm run test:e2e                      # E2E_BASE_URL=http://localhost:4000 by default
```
Set `CRON_SECRET` in both the server and the test shell to include the housekeeping check. Note the suite creates users and roles with random names and, in its last test, temporarily deactivates other administrators (it reactivates the seeded one). Run it against a development database only.

## Production checklist

| Item | Setting |
|---|---|
| Secrets | `JWT_ACCESS_SECRET` random, 32+ characters, not the placeholder. The app refuses to boot otherwise |
| Cookies | `COOKIE_SECURE=true` (enforced). Refresh cookie is `HttpOnly; SameSite=Strict; Path=/api/auth`, so serve the frontend and API from the same site (for example `app.example.com` and `api.example.com`) |
| CORS | `CORS_ORIGINS=https://app.example.com` (never `*`) |
| Reverse proxy | Terminate TLS there and set `TRUST_PROXY=true` **only** if the proxy overwrites `X-Forwarded-For` / `X-Real-IP`. Without it every client shares one rate-limit bucket (the API cannot see socket addresses in route handlers) |
| Rate limiting | In-memory, per instance: with N instances the effective limit is N times higher. Per-account lockout and the password-reset throttle are in the database and are not affected. For multi-instance deployments replace the body of `src/service/rate-limit.service.ts` with Redis (`INCR` + `EXPIRE`) or enforce limits at the edge; the `consume` signature stays |
| Mail | Set `SMTP_URL`. Without it production logs an error and sends nothing (reset links are never logged in production) |
| Uploads | `UPLOAD_DIR` on a persistent volume, outside any web root. Files are stored under random keys, type-checked by content (PNG, JPEG, PDF, plain text), 5 MB max |
| Migrations | `npx prisma migrate deploy`, never `migrate dev`. In Docker: `docker compose --profile app run --rm migrate` |
| Housekeeping | Schedule `POST /api/internal/housekeeping` daily with `Authorization: Bearer $CRON_SECRET`. It purges expired refresh and reset tokens, old sessions and login attempts older than 30 days. `audit_logs` is never purged. Without `CRON_SECRET` the route answers 404 |
| Backups | Back up PostgreSQL and `UPLOAD_DIR` together |
| Logs | JSON lines on stdout in production. `LOG_LEVEL=debug|info|warn|error` |

### Docker

```bash
docker compose --profile app up --build       # db, one-off migrate + seed, then the API on :4000
```
`Dockerfile` targets: `migrate` (Prisma CLI, applies migrations and seeds) and `runner` (default, Next.js standalone output, non-root, healthcheck on `/api/health`). Set real secrets in `.env` first. The migration step needs the `prisma/migrations` folder you generate in step 2 to be committed.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server (port 4000) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Vitest scenarios against a live server |
| `npm run db:up` / `db:down` | Start / stop the Docker database |
| `npm run prisma:migrate` / `prisma:deploy` / `prisma:seed` / `prisma:studio` | Prisma CLI helpers |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` / `Unsafe production configuration` at start | Read the listed variables and fix `.env` |
| Everything returns 429 in production | `TRUST_PROXY` is false behind a proxy: all clients share one bucket |
| Login works but the browser never sends the refresh cookie | Frontend and API are different sites (SameSite=Strict) or `COOKIE_SECURE=true` over plain HTTP |
| `P1001: Can't reach database server` | `npm run db:up`, wait for healthy, check the port in `DATABASE_URL` |
| `Failed to fetch the engine file ... 403` during `prisma generate` | A firewall blocks `binaries.prisma.sh`; allow it or use another network |
| Seeded users cannot sign in | They must be `ACTIVE`; the schema default is `INACTIVE` (the seed sets it explicitly) |
