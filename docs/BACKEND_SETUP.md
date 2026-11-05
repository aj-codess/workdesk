# WorkDesk Backend: Setup Guide

NestJS 11 · TypeScript 5.9 · Prisma 6.19 · PostgreSQL 16. The backend lives at the repository root.
Route contract: `docs/API_ROUTES.md`. Design: `docs/architecture.md`.

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 or newer (22 works) | `node -v` |
| npm | 10 or newer | `npm -v` |
| Docker + Compose | any recent | `docker compose version` (only needed for the bundled database) |

No Docker? Install PostgreSQL 16 yourself, create a `workdesk` database and user, and point `DATABASE_URL` at it.

## 1. Put the files in place

Unzip the delivery at the repository root. It replaces the empty `package.json`, `server.ts`, `src/app.ts`, `prisma.config.ts`, `.env.example` and `.gitignore`, and adds the rest.

## 2. Environment

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Paste the printed value into `JWT_ACCESS_SECRET` in `.env`. Leave the rest as is for local development. `.env` is git-ignored; never commit it.

The app validates `.env` on start and exits with a list of what is wrong. In production it also refuses the placeholder secret and requires `COOKIE_SECURE=true`.

## 3. Install

```bash
npm install
```
This pins Prisma to 6.19.x on purpose. Your `schema.prisma` keeps `url = env("DATABASE_URL")` inside the datasource block, which is the Prisma 6 style. Do not run `npm install prisma@latest`.

## 4. Database

```bash
npm run db:up                  # starts Postgres 16 in Docker
docker compose ps              # wait until the db shows "healthy"
```

## 5. Prisma: client and migrations

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name init
```
Then add the hardening SQL (constraints, partial indexes, append-only audit trigger):
```bash
npx prisma migrate dev --create-only --name db_hardening
# open the new prisma/migrations/<timestamp>_db_hardening/migration.sql
# and paste the contents of prisma/sql/db_hardening.sql into it
npx prisma migrate dev
npx prisma migrate dev         # run once more: it should report the database is in sync
```
If that last run proposes dropping the partial or trigram indexes, stop and tell me. Prisma cannot model them, and they will need a post-migrate step instead.

## 6. Run

```bash
npm run dev
```

| Check | Expect |
|---|---|
| `curl localhost:4000/api/health` | `{"data":{"status":"ok", ...}}` |
| `curl localhost:4000/api/health/ready` | `{"data":{"status":"ok","database":"up"}}` (503 if the database is unreachable) |
| Browser: `http://localhost:4000/api/docs` | Swagger UI |

## 7. Tests

```bash
npm test
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | build and run with file watching |
| `npm run build` / `npm run start:prod` | production build, then `node dist/server.js` |
| `npm run typecheck` | TypeScript check with no output |
| `npm test` | Jest (specs live in `src/tests`) |
| `npm run db:up` / `db:down` | start / stop the Docker database |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | `prisma migrate deploy` (production) |
| `npm run prisma:seed` | run `prisma/seed.ts` (the file arrives in a later delivery) |
| `npm run prisma:studio` | browse the database |

## Where things go

The assignment requires NestJS (modules and dependency injection), so this is a NestJS app laid out in your folders:

| Path | Holds |
|---|---|
| `server.ts` | Bootstrap: helmet, cookies, CORS, `/api` prefix, validation pipe, Swagger |
| `src/app.ts` | Root module. Register each controller and provider here, or group them into `*.module.ts` files beside it |
| `src/config/` | Typed, validated environment (`env.ts`) |
| `src/routes/` | Optional: route-path constants and Swagger tag names, so paths are not repeated as strings |
| `src/controller/` | HTTP layer, `*.controller.ts`. Parse the request, call a service, return. No business rules |
| `src/service/` | Business logic and database access, `*.service.ts` (`PrismaService` is here) |
| `src/middleware/` | Guards, interceptors, exception filters, decorators, pipes (`JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions`) |
| `src/models/` | Request DTOs (class-validator), response mappers, enums |
| `src/utilities/` | Pure helpers: hashing, token generation, pagination, the ticket state machine |
| `src/tests/` | Jest specs (`*.spec.ts`) |
| `prisma/` | `schema.prisma`, `migrations/`, `sql/`, and later `seed.ts` |
| `postman_bundle/` | Postman collection and environment |

MVC mapping for the review: **Model** = Prisma schema plus `src/models`; **View** = response mappers on the API side and the Next.js app on the client; **Controller** = `src/controller` plus `src/service`.

Rule of thumb: controller = HTTP, service = decisions, Prisma = SQL. A controller never touches `PrismaService` directly.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | Read the listed variables; copy `.env.example` to `.env` first |
| `Environment variable not found: DATABASE_URL` from Prisma | `.env` is missing or not in the repo root |
| `P1001: Can't reach database server` | `npm run db:up`, wait for "healthy", and check the port in `DATABASE_URL` |
| Port 5432 already in use | Set `POSTGRES_PORT=5433` and the same port inside `DATABASE_URL` |
| `Failed to fetch the engine file ... 403` during `prisma generate` | A firewall or proxy is blocking `binaries.prisma.sh`. Allow it, or run on another network |
| `EADDRINUSE` on 4000 | Change `PORT` in `.env` |
| TypeScript says `PrismaClient` is not exported | Run `npx prisma generate` |

## Seeding note

`users.status` defaults to `INACTIVE` in your schema. The seed script must create the demo users with `status: 'ACTIVE'` explicitly, or they will not be able to sign in.

## Handing the backend back to me

When you have implemented routes, zip the project **without** `node_modules`, `dist`, `.git` and `.env`, and send it. I will check it against `docs/API_ROUTES.md`, with particular attention to authorization gaps, before we start the frontend.
