# WorkDesk Postman bundle

| File | Purpose |
|---|---|
| `workdesk.postman_collection.json` | 142 requests in 15 folders, in runnable order (Postman v2.1) |
| `workdesk.local.postman_environment.json` | `http://localhost:4000` with the demo seed credentials |
| `workdesk.production.postman_environment.json` | Template: fill in `baseUrl` and credentials. `adminPassword`, `demoPassword`, `cronSecret` are secret-type |

## Use
1. Postman: Import both the collection and an environment, then select the environment (top right).
2. Start the API with demo data: `SEED_DEMO=true npm run prisma:seed`, then `npm run dev`.
3. Run folder `00 Setup` once. It logs in admin, manager, agent, employee and auditor and stores `tokenAdmin`, `tokenManager`, ... Every request picks its own persona token, so you never switch tokens by hand.
4. Run the collection (Run > all folders, **untick `07 Attachments`**), or send requests one at a time. Folders tell one story: create the "Read-Only Auditor" role, assign it, add and later remove `tickets.assign`, run a ticket through its full lifecycle, deactivate a user and prove their token dies.

Every request lists the permission it needs, who it runs as, and the expected status. Expected refusals (401/403/404/409) are asserted, so a green run also proves the security rules.

## Notes
- Ids (roles, users, tickets, departments ...) are saved into the environment by test scripts. You do not paste ids.
- Access tokens last 15 minutes: on 401 `TOKEN_EXPIRED` re-run `00 Setup`.
- The refresh token is an HttpOnly cookie (`SameSite=Strict`, path `/api/auth`). Postman's cookie jar holds one per host, so `POST /api/auth/refresh` refreshes whoever logged in last.
- With `COOKIE_SECURE=true` (required in production) Postman only sends the cookie over https or localhost.
- Rate limits: login 10/min, forgot-password 3 per 15 min per IP. If a run trips them, wait a minute.
- `07 Attachments` needs you to pick a file in the `file` field, so it is manual.
- `13 Operations` housekeeping needs `cronSecret` set to the server's `CRON_SECRET`; otherwise it expects 401/404.
- Re-running is safe: names/emails carry a timestamp and the cleanup folder removes the created user and role.

## Verified
Newman 6 against a production build with real PostgreSQL 16: 137 requests, 199 assertions, 0 failures, on two consecutive runs (folder 07 excluded).
