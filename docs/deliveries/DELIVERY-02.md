# Delivery 02: API route spec, backend setup, runnable scaffold

Same convention as before: only new or modified files, repo-relative paths. Unzip at the repository root.

## Files in this delivery

| Path | Status | What it is |
|---|---|---|
| `docs/API_ROUTES.md` | new | All 91 routes (87 required + 4 optional) with permission, params, query, body, response and errors; shared response shapes; state machine; audit events; scenario map |
| `docs/BACKEND_SETUP.md` | new | Step-by-step setup, scripts, folder map, troubleshooting |
| `package.json` | replaces empty file | NestJS 11, Prisma 6.19, TypeScript 5.9, Jest; all scripts |
| `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` | new | Compiler and Nest CLI config for your folder layout (`server.ts` as entry) |
| `prisma.config.ts` | replaces empty file | Prisma CLI config (schema path, migrations path, seed command, loads `.env`) |
| `.env.example` | replaces empty file | Every variable the backend reads |
| `.gitignore` | replaces empty file | node_modules, dist, .env, storage |
| `docker-compose.yml` | new | Postgres 16 with healthcheck and a named volume |
| `server.ts` | replaces empty file | Bootstrap: helmet, cookies, CORS, `/api` prefix, validation pipe, Swagger at `/api/docs` |
| `src/app.ts` | replaces empty file | Root module (throttler + health) |
| `src/config/env.ts` | new | Validated environment; fails fast with a readable list |
| `src/service/prisma.service.ts` | new | Shared Prisma client |
| `src/controller/health.controller.ts` | new | `GET /api/health`, `GET /api/health/ready` |
| `src/tests/health.spec.ts` | new | 3 smoke tests |
| `docs/architecture.md` | modified | Note that the backend layout is now the one in `BACKEND_SETUP.md` |
| `docs/deliveries/DELIVERY-02.md` | new | This file |

`prisma/schema.prisma` and `prisma/sql/db_hardening.sql` are untouched. Your copy of the schema is the one in use.

## Decisions to confirm

1. **NestJS, not Express.** Your folders (`server.ts`, `src/app.ts`, `routes`, `controller`, `service`, `middleware`, `models`) are Express-shaped, but assignment section 4.2 requires NestJS with modules and dependency injection. I built NestJS into your folders and kept every directory name. If you meant plain Express, say so and I will redo `package.json`, `server.ts` and `app.ts`; `API_ROUTES.md` does not change.
2. **Prisma pinned to 6.19.x.** Your schema keeps `url` in the datasource block (Prisma 6 style). The current npm major is 7, which handles that differently, so `npm install prisma@latest` would break the schema.
3. **Users default to `INACTIVE`** (your change to the schema). `POST /users` therefore creates a user who cannot sign in until `POST /users/:id/activate`, or `activate: true` is passed. Seeded demo users must set `status: 'ACTIVE'` explicitly.

## Verification

Run in a clean copy with your `prisma/schema.prisma`:

| Check | Result |
|---|---|
| `npm install` with the pinned versions | 668 packages; Nest 11.2.8, Prisma 6.19.3, TypeScript 5.9.3 |
| `tsc --noEmit` (includes `prisma.config.ts`) | 0 errors |
| `nest build` | Pass |
| `jest` | 3 / 3 pass |
| `nest start` boot | Pass; `/api/health` 200, `/api/health/ready` 503 with the database down, `/api/docs` 200, unknown route 404, helmet headers present |
| Missing or placeholder secrets | Exit with a clear message |
| `API_ROUTES.md` index vs. sections | 91 / 91 match, no duplicates; every permission key exists in the seeded catalogue |

Not verified here:

- **`prisma generate`, `migrate dev` and `docker compose`.** The sandbox blocks Prisma's engine download and has no Docker. I used a stand-in for the generated client to test everything else. Follow `BACKEND_SETUP.md` steps 4 and 5 on your machine; that is the first real run of the migrations.
- **A database-connected readiness check** (`database: "up"`).

## Suggested next steps

1. You implement the routes from `API_ROUTES.md` in the order in its Appendix E.
2. Send me the backend zip (without `node_modules`, `dist`, `.git`, `.env`). I will review it against the spec, concentrating on authorization.
3. Then the seed script, the frontend, and integration. A Postman collection for `postman_bundle/` can be generated from the route spec if you want it.
