# WorkDesk API: Route Specification (v1)

Single source of truth for every endpoint the backend must expose. Framework-neutral: it works for NestJS or Express.
Companion docs: `docs/architecture.md` (design), `prisma/schema.prisma` (data).

**How to use this file:** tick the checkbox in the index as each route is done. Each route is specified in section 3 with its permission, params, query, body, response and errors. Shared response shapes are defined once in section 2.

---

## 0. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api` (no version prefix). Example: `POST /api/auth/login`. Every path below is relative to it. |
| Format | JSON request and response, `Content-Type: application/json` (exceptions: attachments upload, CSV export). |
| Auth header | `Authorization: Bearer <accessToken>` on every route except those marked **Public**. |
| Refresh cookie | `refresh_token`, `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`. Only sent to `/api/auth/*`. |
| IDs | All `:id` style params are UUIDs. A malformed UUID returns `400 VALIDATION_ERROR`. |
| Timestamps | ISO 8601 UTC strings. |
| Success envelope | `{ "data": <T> }`, plus `"meta"` on lists. `204` has no body. |
| Pagination | Query `page` (int ≥1, default 1), `limit` (int 1-100, default 20), `sort`, `order` (`asc`\|`desc`, default `desc`). Response `meta`: `{ "page", "limit", "total", "totalPages" }`. |
| Error envelope | `{ "error": { "code": "STRING", "message": "human text", "details": [{ "field", "message" }]?, "requestId": "uuid" } }` |
| Unknown body fields | Rejected with `400` (whitelist + forbid non-whitelisted). Never accept `status`, `requesterId`, `assignedAgentId`, `passwordHash`, etc. unless the route lists them. |
| Never returned | `passwordHash`, token hashes, `failedLoginCount`. |
| Out-of-scope records | Return `404 NOT_FOUND`, not `403`, so ids cannot be probed. `403` is only for a missing permission. |
| Guard order | authenticate (JWT + live session + active user) → permission → scope (record access) → state machine → audit. |

### Standard error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad body, query or param. `details` lists each field. |
| 401 | `UNAUTHENTICATED` | Missing or invalid access token. |
| 401 | `TOKEN_EXPIRED` | Access token expired. The client calls `/auth/refresh` once, then retries. |
| 401 | `SESSION_REVOKED` | Session revoked or user deactivated. The client goes to login. |
| 401 | `INVALID_CREDENTIALS` | Login failed. One generic message for unknown email, wrong password, inactive and locked. |
| 403 | `FORBIDDEN` | Authenticated but missing the permission. |
| 403 | `PRIVILEGE_ESCALATION` | Tried to grant a permission or role the caller does not hold, or to change own roles. |
| 404 | `NOT_FOUND` | Missing record, or a record outside the caller's scope. |
| 409 | `CONFLICT` | Duplicate unique value (email, role name, department name or code, category name). |
| 409 | `INVALID_STATE_TRANSITION` | Ticket action not allowed from its current status. |
| 409 | `ROLE_IN_USE` | Deleting a role that is assigned or is a system role. |
| 409 | `LAST_ADMIN_PROTECTED` | Action would remove the last holder of `roles.assign_permissions` + `users.assign_roles`. |
| 409 | `CANNOT_MODIFY_SELF` | Self-deactivate, self-delete, own roles. |
| 409 | `HAS_OPEN_ASSIGNMENTS` | User still holds open assigned tickets. |
| 409 | `DEPARTMENT_NEEDS_MANAGER` | Removing the last manager while tickets await review. |
| 422 | `LIMIT_EXCEEDED` | E.g. more than `department.max_managers` managers. |
| 422 | `INVALID_CURRENT_PASSWORD` | Wrong current password on change-password. Deliberately not 401, so the client does not treat it as an expired session. |
| 422 | `AGENT_NOT_ELIGIBLE` | Assignee is inactive, not in the department roster, or lacks `tickets.view_assigned`. |
| 429 | `TOO_MANY_REQUESTS` | Rate limit hit. Send `Retry-After`. |
| 500 | `INTERNAL_ERROR` | Never leak stack traces. |

### Rate limits (per IP unless stated)

| Route | Limit |
|---|---|
| `POST /auth/login` | 10 / minute, plus account lockout: 5 consecutive failures → `lockedUntil = now + 15 min` |
| `POST /auth/refresh` | 30 / minute |
| `POST /auth/forgot-password` | 3 / 15 min (per IP and per email) |
| `POST /auth/reset-password` | 5 / 15 min |
| `GET /reports/export` | 5 / minute per user |
| Everything else | 300 / minute |

### Password policy

8-128 characters, at least one lowercase, one uppercase and one digit. Hash with argon2id.

---

## 1. Route index (implementation checklist)

`P` = Public. Otherwise the permission(s) required. "Auth" = any authenticated user. "Scope" = record-level visibility check applies.

| ✓ | Method | Path | Access |
|---|---|---|---|
| [ ] | GET | `/health` | P |
| [ ] | GET | `/health/ready` | P |
| | | **Auth** | |
| [ ] | POST | `/auth/login` | P |
| [ ] | POST | `/auth/refresh` | P (cookie) |
| [ ] | POST | `/auth/logout` | P (cookie) |
| [ ] | POST | `/auth/logout-all` | Auth |
| [ ] | GET | `/auth/me` | Auth |
| [ ] | POST | `/auth/change-password` | Auth |
| [ ] | POST | `/auth/forgot-password` | P |
| [ ] | POST | `/auth/reset-password` | P |
| [ ] | GET | `/auth/sessions` | Auth |
| [ ] | DELETE | `/auth/sessions/:sessionId` | Auth |
| [ ] | PATCH | `/profile` | Auth (self) |
| | | **Users** | |
| [ ] | GET | `/users` | `users.view` |
| [ ] | POST | `/users` | `users.create` |
| [ ] | GET | `/users/:id` | `users.view` or self |
| [ ] | PATCH | `/users/:id` | `users.update` |
| [ ] | DELETE | `/users/:id` | `users.delete` |
| [ ] | POST | `/users/:id/activate` | `users.activate` |
| [ ] | POST | `/users/:id/deactivate` | `users.activate` |
| [ ] | PUT | `/users/:id/roles` | `users.assign_roles` |
| [ ] | POST | `/users/:id/reset-password` | `users.update` |
| [ ] | GET | `/users/:id/sessions` | `users.revoke_sessions` |
| [ ] | DELETE | `/users/:id/sessions` | `users.revoke_sessions` |
| | | **Roles and permissions** | |
| [ ] | GET | `/roles` | `roles.view` |
| [ ] | POST | `/roles` | `roles.create` |
| [ ] | GET | `/roles/:id` | `roles.view` |
| [ ] | PATCH | `/roles/:id` | `roles.update` |
| [ ] | DELETE | `/roles/:id` | `roles.delete` |
| [ ] | PUT | `/roles/:id/permissions` | `roles.assign_permissions` |
| [ ] | GET | `/roles/:id/users` | `roles.view` + `users.view` |
| [ ] | GET | `/permissions` | `permissions.view` |
| | | **Departments and categories** | |
| [ ] | GET | `/departments` | `departments.view` |
| [ ] | POST | `/departments` | `departments.create` |
| [ ] | GET | `/departments/:id` | `departments.view` |
| [ ] | PATCH | `/departments/:id` | `departments.update` |
| [ ] | GET | `/departments/:id/managers` | `departments.view` |
| [ ] | POST | `/departments/:id/managers` | `departments.manage_members` |
| [ ] | DELETE | `/departments/:id/managers/:userId` | `departments.manage_members` |
| [ ] | GET | `/departments/:id/members` | `departments.view` |
| [ ] | POST | `/departments/:id/members` | `departments.manage_members` |
| [ ] | DELETE | `/departments/:id/members/:userId` | `departments.manage_members` |
| [ ] | GET | `/categories` | `categories.view` |
| [ ] | POST | `/categories` | `categories.manage` + dept scope |
| [ ] | GET | `/categories/:id` | `categories.view` |
| [ ] | PATCH | `/categories/:id` | `categories.manage` + dept scope |
| | | **Tickets** | |
| [ ] | GET | `/tickets` | any `tickets.view_*` · Scope |
| [ ] | POST | `/tickets` | `tickets.create` |
| [ ] | GET | `/tickets/:id` | any `tickets.view_*` · Scope |
| [ ] | PATCH | `/tickets/:id` | `tickets.update_own` or `tickets.update_assigned` · Scope |
| [ ] | PATCH | `/tickets/:id/priority` | `tickets.change_priority` · Scope |
| [ ] | DELETE | `/tickets/:id` | `tickets.delete` · Scope |
| [ ] | POST | `/tickets/:id/accept` | `tickets.accept` · Scope |
| [ ] | POST | `/tickets/:id/reject` | `tickets.reject` · Scope |
| [ ] | POST | `/tickets/:id/request-clarification` | `tickets.request_clarification` · Scope |
| [ ] | POST | `/tickets/:id/provide-clarification` | `tickets.update_own` · requester only |
| [ ] | POST | `/tickets/:id/assign` | `tickets.assign` · Scope |
| [ ] | POST | `/tickets/:id/status` | `tickets.change_status` · Scope |
| [ ] | POST | `/tickets/:id/resolve` | `tickets.resolve` · Scope |
| [ ] | POST | `/tickets/:id/close` | `tickets.close` · Scope |
| [ ] | POST | `/tickets/:id/reopen` | `tickets.reopen` · Scope |
| [ ] | POST | `/tickets/:id/cancel` | `tickets.update_own` · requester only |
| [ ] | POST | `/tickets/:id/transfer` | `tickets.transfer_department` · Scope |
| [ ] | GET | `/tickets/:id/comments` | any `tickets.view_*` · Scope |
| [ ] | POST | `/tickets/:id/comments` | `tickets.comment` · Scope |
| [ ] | PATCH | `/tickets/:id/comments/:commentId` | author only |
| [ ] | DELETE | `/tickets/:id/comments/:commentId` | author or `tickets.delete` |
| [ ] | GET | `/tickets/:id/activity` | any `tickets.view_*` · Scope |
| [ ] | GET | `/tickets/:id/assignments` | staff scope only |
| [ ] | GET | `/tickets/:id/attachments` | Scope · *optional* |
| [ ] | POST | `/tickets/:id/attachments` | Scope · *optional* |
| [ ] | GET | `/tickets/:id/attachments/:attachmentId/download` | Scope · *optional* |
| [ ] | DELETE | `/tickets/:id/attachments/:attachmentId` | uploader or `tickets.delete` · *optional* |
| | | **Dashboard, reports, audit, settings** | |
| [ ] | GET | `/dashboard/my-requests` | `tickets.view_own` |
| [ ] | GET | `/dashboard/my-work` | `tickets.view_assigned` |
| [ ] | GET | `/dashboard/department` | `tickets.view_department` |
| [ ] | GET | `/dashboard/system` | `tickets.view_all` |
| [ ] | GET | `/reports/summary` | `reports.view` |
| [ ] | GET | `/reports/tickets` | `reports.view` |
| [ ] | GET | `/reports/team-performance` | `reports.view` |
| [ ] | GET | `/reports/export` | `reports.export` |
| [ ] | GET | `/audit-logs` | `audit_logs.view` |
| [ ] | GET | `/audit-logs/:id` | `audit_logs.view` |
| [ ] | GET | `/settings` | `settings.view` |
| [ ] | GET | `/settings/:key` | `settings.view` |
| [ ] | PUT | `/settings/:key` | `settings.update` |
| | | **Lookups (lightweight dropdown data)** | |
| [ ] | GET | `/lookups/departments` | `tickets.create` or `tickets.transfer_department` or `departments.view` |
| [ ] | GET | `/lookups/categories` | `tickets.create` or `tickets.transfer_department` or `categories.view` |
| [ ] | GET | `/lookups/agents` | `tickets.assign` |
| [ ] | GET | `/lookups/roles` | `users.assign_roles` or `users.create` |
| [ ] | GET | `/lookups/users` | `departments.manage_members` |

Total: 91 routes (87 required + 4 optional attachment routes). There are deliberately no create, update or delete routes for permissions (the catalogue is seeded) and no `DELETE /departments` or `DELETE /categories` (deactivate with `isActive: false` instead).

---

## 2. Shared response shapes

```jsonc
// UserRef
{ "id": "uuid", "firstName": "string", "lastName": "string", "email": "string" }

// UserSummary
{
  "id": "uuid", "email": "string", "firstName": "string", "lastName": "string",
  "status": "ACTIVE | INACTIVE",
  "department": { "id": "uuid", "name": "string", "code": "string" } | null,
  "roles": [{ "id": "uuid", "name": "string" }],
  "lastLoginAt": "ISO | null", "createdAt": "ISO"
}

// UserDetail = UserSummary +
{
  "phone": "string | null", "jobTitle": "string | null", "avatarUrl": "string | null",
  "mustChangePassword": false, "deactivatedAt": "ISO | null", "updatedAt": "ISO",
  "managedDepartments": [{ "id": "uuid", "name": "string" }],
  "memberDepartments":  [{ "id": "uuid", "name": "string" }]
}

// AuthUser (login and /auth/me): UserDetail without lastLoginAt/deactivatedAt, plus
{ "managedDepartmentIds": ["uuid"], "memberDepartmentIds": ["uuid"] }

// Permission
{ "id": "uuid", "key": "tickets.assign", "module": "tickets", "description": "string" }

// Role
{ "id": "uuid", "name": "string", "description": "string | null", "isActive": true, "isSystem": false,
  "permissionCount": 0, "userCount": 0, "createdAt": "ISO", "updatedAt": "ISO" }
// RoleDetail = Role + { "permissions": [Permission] }

// Department
{ "id": "uuid", "name": "string", "code": "IT", "description": "string | null", "isActive": true,
  "managerCount": 0, "memberCount": 0, "createdAt": "ISO" }
// DepartmentDetail = Department + { "managers": [UserRef] }

// Category
{ "id": "uuid", "departmentId": "uuid", "name": "string", "description": "string | null",
  "isActive": true, "isSensitive": false }

// TicketSummary
{
  "id": "uuid", "number": 123, "reference": "WD-2026-000123",
  "title": "string",
  "status": "PENDING_REVIEW | CLARIFICATION_REQUESTED | ACCEPTED | REJECTED | ASSIGNED | IN_PROGRESS | RESOLVED | CLOSED | REOPENED | CANCELLED",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "category": { "id": "uuid", "name": "string" },
  "department": { "id": "uuid", "name": "string", "code": "string" },
  "requester": { "id": "uuid", "firstName": "string", "lastName": "string" },
  "assignedAgent": UserRef | null,
  "createdAt": "ISO", "updatedAt": "ISO"
}

// TicketDetail = TicketSummary +
{
  "description": "string",
  "requester": {
    "id": "uuid", "firstName": "string", "lastName": "string",
    // The next three are included ONLY for staff scope (view_assigned / view_department / view_all).
    // A requester who holds just view_own sees only name.
    "email": "string", "department": { "id": "uuid", "name": "string" } | null,
    "roles": ["string"]            // snapshot taken at submission time
  },
  "reviewedBy": UserRef | null, "reviewedAt": "ISO | null", "rejectionReason": "string | null",
  "resolution": "string | null", "resolvedBy": UserRef | null, "resolvedAt": "ISO | null",
  "closedAt": "ISO | null", "reopenCount": 0,
  "allowedActions": ["edit", "change_priority", "accept", "reject", "request_clarification",
    "provide_clarification", "assign", "reassign", "start", "resolve", "close", "reopen",
    "cancel", "transfer", "comment", "add_work_note", "delete"]
}
// allowedActions is computed server-side from permission + scope + current status.
// It only drives which buttons the UI shows. Every action route re-checks everything.

// Comment
{ "id": "uuid", "kind": "COMMENT | WORK_NOTE | CLARIFICATION", "body": "string",
  "author": { "id": "uuid", "firstName": "string", "lastName": "string" },
  "createdAt": "ISO", "editedAt": "ISO | null" }

// Activity
{ "id": "uuid", "action": "SUBMITTED | UPDATED | CLARIFICATION_REQUESTED | CLARIFICATION_PROVIDED | ACCEPTED | REJECTED | ASSIGNED | REASSIGNED | STATUS_CHANGED | PRIORITY_CHANGED | DEPARTMENT_TRANSFERRED | COMMENTED | RESOLVED | CLOSED | REOPENED | CANCELLED | DELETED",
  "fromStatus": "TicketStatus | null", "toStatus": "TicketStatus | null",
  "actor": UserRef | null, "metadata": { }, "createdAt": "ISO" }

// Assignment
{ "id": "uuid", "agent": UserRef, "assignedBy": UserRef, "assignedAt": "ISO",
  "unassignedAt": "ISO | null", "reason": "string | null" }

// Attachment
{ "id": "uuid", "fileName": "string", "mimeType": "string", "sizeBytes": 0,
  "uploadedBy": UserRef, "commentId": "uuid | null", "createdAt": "ISO" }

// Session
{ "id": "uuid", "userAgent": "string | null", "ipAddress": "string | null",
  "createdAt": "ISO", "lastUsedAt": "ISO", "expiresAt": "ISO", "current": true }

// AuditLog
{ "id": "string",                    // BigInt serialised as string
  "actor": UserRef | null, "action": "roles.permissions_updated", "entityType": "role | null",
  "entityId": "string | null", "outcome": "SUCCESS | DENIED | FAILURE",
  "before": { } | null, "after": { } | null,
  "ipAddress": "string | null", "userAgent": "string | null", "requestId": "string | null",
  "createdAt": "ISO" }

// Setting
{ "key": "department.max_managers", "value": 3, "description": "string | null",
  "updatedAt": "ISO", "updatedBy": UserRef | null }
```

---

## 3. Routes

### 3.1 Health

#### `GET /health`
**Public.** Liveness. `200 { "data": { "status": "ok", "uptime": 123.4 } }`.

#### `GET /health/ready`
**Public.** Readiness: runs `SELECT 1`. `200 { "data": { "status": "ok", "database": "up" } }` or `503 { "data": { "status": "degraded", "database": "down" } }`.

---

### 3.2 Auth

#### `POST /auth/login`
**Public** · rate-limited.
```jsonc
// Body
{ "email": "string (email, ≤255, lowercased server-side)", "password": "string (1-128)" }
```
`200`
```jsonc
{ "data": { "accessToken": "jwt", "tokenType": "Bearer", "expiresIn": 900,
            "user": AuthUser, "permissions": ["tickets.create", "tickets.view_own"] } }
```
Sets the `refresh_token` cookie (7 days).
Errors: `400`, `401 INVALID_CREDENTIALS`, `429`.
Server work: verify against a dummy hash when the email is unknown (uniform timing) · reject `INACTIVE`, soft-deleted, or `lockedUntil > now` with the same generic message · on failure increment `failedLoginCount` (lock at 5) and write `login_attempts` + audit · on success reset counters, set `lastLoginAt`, create `sessions` + first `refresh_tokens` row (hash only), audit `auth.login`.

#### `POST /auth/refresh`
**Public** (cookie). No body. The `Origin` header must match the allowed origin (CSRF defence), else `403`.
`200 { "data": { "accessToken": "jwt", "tokenType": "Bearer", "expiresIn": 900 } }` and a **new** cookie.
Errors: `401 UNAUTHENTICATED` (missing, unknown, expired or revoked token), `401 SESSION_REVOKED` (reuse detected, whole session killed, cookie cleared).
Server work: hash cookie → look up → if `usedAt` already set (outside a ~10 s grace window) revoke the session with `REFRESH_REUSE_DETECTED` and audit → else in one transaction mark used, insert the new token, set `replacedById`, bump `lastUsedAt`. Also re-check the user is still `ACTIVE`.
Web client: call this once on every page load, then `GET /auth/me` (this is how login survives a refresh).

#### `POST /auth/logout`
**Public** (cookie). Revokes the session that owns the presented refresh cookie (`LOGOUT`). Idempotent. `204` and clears the cookie. Works even when the access token has expired.

#### `POST /auth/logout-all`
**Auth.** Revokes every session of the caller (`LOGOUT_ALL`). `204`, clears the cookie.

#### `GET /auth/me`
**Auth.** `200 { "data": { "user": AuthUser, "permissions": ["..."] } }`. Permissions are resolved from the database on each call (union over the user's active roles).

#### `POST /auth/change-password`
**Auth.**
```jsonc
{ "currentPassword": "string", "newPassword": "string (password policy, must differ from current)" }
```
`204`. Revokes all sessions (`PASSWORD_CHANGED`), sets `passwordChangedAt`, clears `mustChangePassword`, clears the cookie; the client logs in again.
Errors: `400`, `422 INVALID_CURRENT_PASSWORD`.

#### `POST /auth/forgot-password`
**Public** · rate-limited.
```jsonc
{ "email": "string (email)" }
```
Always `202 { "data": { "message": "If the account exists, a reset link has been sent." } }` regardless of whether the email exists.
Server work: only for an `ACTIVE` user, create a `password_reset_tokens` row (256-bit random token, **SHA-256 hash stored**, expires in 30 min, store `requestedIp`). Deliver `${FRONTEND_URL}/reset-password?token=<raw>` by email. If no mailer is configured, log the link to the server console in non-production (this is the "clearly documented approach" the assignment allows).

#### `POST /auth/reset-password`
**Public** · rate-limited.
```jsonc
{ "token": "string (64 hex chars)", "newPassword": "string (password policy)" }
```
`204`. Marks the token used, updates the password, revokes all sessions (`PASSWORD_RESET`), clears `lockedUntil`/`failedLoginCount`.
Errors: `400 VALIDATION_ERROR` (invalid, expired or used token: one generic message).

#### `GET /auth/sessions`
**Auth.** The caller's live sessions (not revoked, not expired). `200 { "data": [Session] }` with `current: true` on the one matching the access token's `sid`.

#### `DELETE /auth/sessions/:sessionId`
**Auth.** Revokes one of the caller's own sessions (`LOGOUT`). Another user's session id returns `404`. `204`.

#### `PATCH /profile`
**Auth** (self only; the id comes from the token, never from the body).
```jsonc
// all optional, at least one required
{ "firstName": "string (1-100)", "lastName": "string (1-100)",
  "phone": "string (≤30) | null", "jobTitle": "string (≤120) | null", "avatarUrl": "string (https url) | null" }
```
`200 { "data": AuthUser }`. Email, department, status and roles cannot be changed here. Read your profile with `GET /auth/me`.

---

### 3.3 Users

#### `GET /users`
`users.view`
Query: `page`, `limit`, `search` (name or email, ILIKE), `status` (`ACTIVE`\|`INACTIVE`), `roleId` (uuid), `departmentId` (uuid), `sort` (`createdAt`\|`firstName`\|`lastName`\|`email`\|`lastLoginAt`), `order`.
`200 { "data": [UserSummary], "meta": {…} }`. Soft-deleted users are excluded.

#### `POST /users`
`users.create`
```jsonc
{
  "email": "string (email, unique, lowercased)",
  "firstName": "string (1-100)", "lastName": "string (1-100)",
  "password": "string (password policy), optional: omit to auto-generate",
  "phone": "string (≤30)?", "jobTitle": "string (≤120)?", "departmentId": "uuid?",
  "roleIds": ["uuid"]?,            // requires users.assign_roles AND the escalation rule (see PUT /users/:id/roles)
  "activate": false,               // optional; true requires users.activate. Default false, because the schema default status is INACTIVE
  "mustChangePassword": true       // optional, default true
}
```
`201 { "data": { "user": UserDetail, "temporaryPassword": "string (only when generated; shown once)" } }`
Errors: `400`, `403 PRIVILEGE_ESCALATION`, `409 CONFLICT` (email).
Created accounts are `INACTIVE` until activated, so they cannot sign in. Audit `users.created`.

#### `GET /users/:id`
`users.view`, or the caller is that user. `200 { "data": UserDetail }`. `404` if missing or soft-deleted.

#### `PATCH /users/:id`
`users.update`
```jsonc
// all optional, at least one required
{ "email": "string (email, unique)", "firstName": "string", "lastName": "string",
  "phone": "string | null", "jobTitle": "string | null", "avatarUrl": "string | null",
  "departmentId": "uuid | null", "mustChangePassword": "boolean" }
```
`200 { "data": UserDetail }`. `status`, `roleIds` and password are **not** accepted here (use the dedicated routes). Audit with before/after. Errors: `400`, `404`, `409`.

#### `DELETE /users/:id`
`users.delete`. Soft delete (`deletedAt`), revokes all sessions, removes their manager/member rows. `204`.
Errors: `409 CANNOT_MODIFY_SELF`, `409 LAST_ADMIN_PROTECTED`, `409 HAS_OPEN_ASSIGNMENTS`. Audit `users.deleted`.

#### `POST /users/:id/activate`
`users.activate`. No body. Sets `ACTIVE`, `deactivatedAt = null`, clears `lockedUntil` and `failedLoginCount`. `200 { "data": UserDetail }`. Audit `users.activated`.

#### `POST /users/:id/deactivate`
`users.activate`
```jsonc
{ "reason": "string (≤500)?" }
```
`200 { "data": UserDetail }`. Sets `INACTIVE`, `deactivatedAt = now`, **revokes every session** (`USER_DEACTIVATED`). Their next API call returns `401 SESSION_REVOKED`.
Errors: `409 CANNOT_MODIFY_SELF`, `409 LAST_ADMIN_PROTECTED`. Audit `users.deactivated`.

#### `PUT /users/:id/roles`
`users.assign_roles`. Replaces the user's full role set.
```jsonc
{ "roleIds": ["uuid"] }     // 0-20 unique ids
```
`200 { "data": { "userId": "uuid", "roles": [{ "id": "uuid", "name": "string" }] } }`
Rules:
- Caller cannot change their own roles → `409 CANNOT_MODIFY_SELF`.
- Every **newly added** role must be active, and each of its permissions must be held by the caller → else `403 PRIVILEGE_ESCALATION`.
- Must not strip the last holder of `roles.assign_permissions` + `users.assign_roles` → `409 LAST_ADMIN_PROTECTED`.
- Takes effect on the target's very next request (permissions are resolved per request). Audit `users.roles_updated` with before/after.

#### `POST /users/:id/reset-password`
`users.update`. Admin sets a new password for another user.
```jsonc
{ "newPassword": "string (password policy)?" }     // omit to auto-generate
```
`200 { "data": { "temporaryPassword": "string (only when generated)" } }`. Sets `mustChangePassword = true`, revokes all of that user's sessions (`PASSWORD_RESET`). `409 CANNOT_MODIFY_SELF` (use change-password). Audit `users.password_reset`.

#### `GET /users/:id/sessions`
`users.revoke_sessions`. `200 { "data": [Session] }` (`current` is always `false`).

#### `DELETE /users/:id/sessions`
`users.revoke_sessions`. Revokes all of that user's sessions (`ADMIN_REVOKED`). `204`. Audit `users.sessions_revoked`.

---

### 3.4 Roles and permissions

#### `GET /roles`
`roles.view`. Query: `page`, `limit`, `search`, `isActive` (bool), `sort` (`name`\|`createdAt`\|`userCount`), `order`. `200 { "data": [Role], "meta": {…} }`.

#### `POST /roles`
`roles.create`
```jsonc
{ "name": "string (2-80, unique, case-insensitive)", "description": "string (≤500)?",
  "isActive": true, "permissionIds": ["uuid"]? }     // permissionIds also requires roles.assign_permissions
```
`201 { "data": RoleDetail }`. Errors: `400`, `403 PRIVILEGE_ESCALATION` (including a permission the caller lacks), `409 CONFLICT`. Audit `roles.created`.

#### `GET /roles/:id`
`roles.view`. `200 { "data": RoleDetail }`.

#### `PATCH /roles/:id`
`roles.update`
```jsonc
{ "name": "string?", "description": "string | null?", "isActive": "boolean?" }   // at least one
```
`200 { "data": Role }`. System roles: `name` is immutable. The System Administrator role cannot be deactivated (`409 LAST_ADMIN_PROTECTED`). Deactivating a role removes its permissions from every holder immediately. Errors: `400`, `404`, `409`.

#### `DELETE /roles/:id`
`roles.delete`. `204`. `409 ROLE_IN_USE` if `isSystem` or still assigned to any user. Audit `roles.deleted`.

#### `PUT /roles/:id/permissions`
`roles.assign_permissions`. Replaces the role's full permission set (this is how you add **and** remove permissions).
```jsonc
{ "permissionIds": ["uuid"] }     // 0-200 unique ids from GET /permissions
```
`200 { "data": { "role": RoleDetail, "added": ["tickets.assign"], "removed": ["reports.view"] } }`
Rules: every **added** permission must be held by the caller (`403 PRIVILEGE_ESCALATION`) · on the System Administrator role, `roles.assign_permissions` and `users.assign_roles` can't be removed (`409 LAST_ADMIN_PROTECTED`) · unknown ids → `400`. Audit `roles.permissions_updated` with the diff. Effective immediately for every user holding the role.

#### `GET /roles/:id/users`
`roles.view` **and** `users.view`. Query: `page`, `limit`, `search`. `200 { "data": [UserSummary], "meta": {…} }`.

#### `GET /permissions`
`permissions.view`. Read-only catalogue.
Query: `module` (string?), `grouped` (bool, default false).
`200 { "data": [Permission] }`, or with `grouped=true` `{ "data": { "tickets": [Permission], "users": [Permission], … } }`.

---

### 3.5 Departments

#### `GET /departments`
`departments.view`. Query: `page`, `limit`, `search`, `isActive`, `sort` (`name`\|`code`\|`createdAt`), `order`. `200 { "data": [Department], "meta": {…} }`.

#### `POST /departments`
`departments.create`
```jsonc
{ "name": "string (2-120, unique)", "code": "string (2-20, A-Z 0-9 _ -, unique, uppercased server-side)",
  "description": "string (≤1000)?" }
```
`201 { "data": DepartmentDetail }`. Errors: `400`, `409 CONFLICT`. Audit `departments.created`.

#### `GET /departments/:id`
`departments.view`. `200 { "data": DepartmentDetail }`.

#### `PATCH /departments/:id`
`departments.update`
```jsonc
{ "name": "string?", "code": "string?", "description": "string | null?", "isActive": "boolean?" }
```
`200 { "data": DepartmentDetail }`. Deactivating hides it from `/lookups/departments` (no new tickets); existing tickets continue. Audit with before/after.

#### `GET /departments/:id/managers`
`departments.view`. `200 { "data": [UserRef] }`.

#### `POST /departments/:id/managers`
`departments.manage_members`
```jsonc
{ "userId": "uuid" }
```
`201 { "data": { "managers": [UserRef], "warnings": ["User holds no role granting tickets.view_department"]? } }`
Errors: `404` (user), `409 CONFLICT` (already a manager), `422 LIMIT_EXCEEDED` (more than setting `department.max_managers`, default 3), `422` if the user is not `ACTIVE`. This grants **scope only**. The user still needs a role carrying the ticket permissions, which is why the response warns. Audit `departments.manager_added`.

#### `DELETE /departments/:id/managers/:userId`
`departments.manage_members`. `204`. `409 DEPARTMENT_NEEDS_MANAGER` if this is the last manager and tickets in `PENDING_REVIEW` or `CLARIFICATION_REQUESTED` exist. Audit `departments.manager_removed`.

#### `GET /departments/:id/members`
`departments.view`. Query: `page`, `limit`, `search`.
`200 { "data": [{ "user": UserRef, "addedAt": "ISO", "openTickets": 2 }], "meta": {…} }`. Members are the support agents a manager may assign to.

#### `POST /departments/:id/members`
`departments.manage_members`
```jsonc
{ "userIds": ["uuid"] }     // 1-50 unique, all must be ACTIVE
```
`201 { "data": { "added": 3, "skipped": 1 } }` (already-members are skipped). Audit `departments.members_added`.

#### `DELETE /departments/:id/members/:userId`
`departments.manage_members`. `204`. `409 HAS_OPEN_ASSIGNMENTS` while that user holds `ASSIGNED`, `IN_PROGRESS` or `REOPENED` tickets of this department (reassign first). Audit `departments.member_removed`.

---

### 3.6 Categories

Categories belong to one department. Management scope: the caller must be a **manager of that department**, unless they also hold `departments.update` (admin level). Out-of-scope → `404`.

#### `GET /categories`
`categories.view`. Query: `departmentId` (uuid?), `isActive`, `search`, `page`, `limit` (default 50). `200 { "data": [Category], "meta": {…} }`.

#### `POST /categories`
`categories.manage` + department scope
```jsonc
{ "departmentId": "uuid", "name": "string (2-120, unique within the department)",
  "description": "string (≤500)?", "isSensitive": false }
```
`201 { "data": Category }`. Errors: `400`, `404`, `409 CONFLICT`.

#### `GET /categories/:id`
`categories.view`. `200 { "data": Category }`.

#### `PATCH /categories/:id`
`categories.manage` + department scope
```jsonc
{ "name": "string?", "description": "string | null?", "isActive": "boolean?", "isSensitive": "boolean?" }
```
`200 { "data": Category }`. `departmentId` is immutable (use ticket transfer instead).

---

### 3.7 Tickets

**Visibility scope** (computed server-side, union of what the caller's permissions grant):
`tickets.view_all` → every non-deleted ticket · `tickets.view_department` → tickets of departments the caller manages · `tickets.view_assigned` → tickets where `assignedAgentId = me` · `tickets.view_own` → tickets where `requesterId = me`.
Every read **and** every mutation passes through this scope. A ticket outside it returns `404`.

**Action pattern:** each action route requires its permission, then scope, then a legal transition (see Appendix A). An illegal transition returns `409 INVALID_STATE_TRANSITION`. Every success writes a `ticket_activity` row; privileged actions also write `audit_logs`. All action routes respond `200 { "data": TicketDetail }` unless stated.

#### `GET /tickets`
Any `tickets.view_*` (else `403`). Query:

| Param | Type | Notes |
|---|---|---|
| `page`, `limit`, `order` | | default `limit` 20 |
| `search` | string | title, description, or reference (`WD-2026-000123` / `123`) |
| `status` | comma list of TicketStatus | e.g. `PENDING_REVIEW,ACCEPTED` |
| `priority` | comma list | `LOW,MEDIUM,HIGH,CRITICAL` |
| `categoryId` | uuid | |
| `departmentId` | uuid | |
| `requesterId` | uuid | staff scopes only |
| `assignedAgentId` | uuid \| `me` \| `none` | `none` = unassigned |
| `view` | `mine`\|`assigned`\|`department`\|`all` | only **narrows** within what the caller may see |
| `createdFrom`, `createdTo` | ISO date | |
| `sort` | `createdAt`\|`updatedAt`\|`priority`\|`status`\|`number` | default `createdAt` |

`200 { "data": [TicketSummary], "meta": {…} }`. Filters that point outside scope return an empty list, never a `403`.
The department review queue is `?departmentId=<id>&status=PENDING_REVIEW,CLARIFICATION_REQUESTED`. "Unassigned accepted" is `?status=ACCEPTED&assignedAgentId=none`. An agent's request history is `?view=assigned&status=RESOLVED,CLOSED`.

#### `POST /tickets`
`tickets.create`
```jsonc
{ "title": "string (3-200)", "description": "string (10-10000)",
  "departmentId": "uuid",          // ANY active department, regardless of the requester's own
  "categoryId": "uuid",            // must belong to departmentId and be active
  "priority": "LOW | MEDIUM | HIGH | CRITICAL (default MEDIUM)" }
```
`201 { "data": TicketDetail }`
Server sets: `status = PENDING_REVIEW`, `requesterId` from the token, `requesterDepartmentId` and `requesterSnapshot` `{ name, email, department, roles[] }`, a `SUBMITTED` activity row. Errors: `400`, `404` (department/category), `422` if the department is inactive.

#### `GET /tickets/:id`
Any `tickets.view_*` · scope. `200 { "data": TicketDetail }` (includes `allowedActions`). Out of scope → `404`.

#### `PATCH /tickets/:id`
Scope, and one of:
- the **requester** with `tickets.update_own`, while status is `PENDING_REVIEW` or `CLARIFICATION_REQUESTED`;
- the **assignee** with `tickets.update_assigned`, while `ASSIGNED`, `IN_PROGRESS` or `REOPENED`.
```jsonc
{ "title": "string (3-200)?", "description": "string (10-10000)?", "categoryId": "uuid?" }   // at least one; category must belong to the ticket's department
```
`200 { "data": TicketDetail }`. Activity `UPDATED` with before/after. Priority, status, department and assignee are **not** editable here.

#### `PATCH /tickets/:id/priority`
`tickets.change_priority` · scope. Not allowed on `REJECTED`, `CANCELLED` or `CLOSED`.
```jsonc
{ "priority": "LOW | MEDIUM | HIGH | CRITICAL", "reason": "string (≤500)?" }
```
`200 { "data": TicketDetail }`. Activity `PRIORITY_CHANGED`.

#### `DELETE /tickets/:id`
`tickets.delete` · scope. Soft delete (`deletedAt`). `204`. Audit `tickets.deleted`.

#### `POST /tickets/:id/accept`
`tickets.accept` · scope. `PENDING_REVIEW → ACCEPTED`.
```jsonc
{ "note": "string (≤1000)?" }
```
Sets `reviewedById`, `reviewedAt`. Activity `ACCEPTED`. Acceptance means the department agrees to handle the request. It does **not** authorise releasing sensitive data.

#### `POST /tickets/:id/reject`
`tickets.reject` · scope. `PENDING_REVIEW → REJECTED` (terminal).
```jsonc
{ "reason": "string (5-1000, required)" }
```
Stores `rejectionReason`, `reviewedById`, `reviewedAt`. Activity `REJECTED`.

#### `POST /tickets/:id/request-clarification`
`tickets.request_clarification` · scope. `PENDING_REVIEW → CLARIFICATION_REQUESTED`.
```jsonc
{ "question": "string (5-2000, required)" }
```
Creates a `CLARIFICATION` comment. Activity `CLARIFICATION_REQUESTED`.

#### `POST /tickets/:id/provide-clarification`
**Requester only** (`tickets.update_own` and `requesterId = me`). `CLARIFICATION_REQUESTED → PENDING_REVIEW`.
```jsonc
{ "response": "string (5-5000, required)", "description": "string (10-10000)?" }   // optional description update
```
Creates a `CLARIFICATION` comment. Activity `CLARIFICATION_PROVIDED`.

#### `POST /tickets/:id/assign`
`tickets.assign` · scope. Assigns, or reassigns. Allowed from `ACCEPTED` and `REOPENED` (→ `ASSIGNED`), and from `ASSIGNED` or `IN_PROGRESS` (status unchanged).
```jsonc
{ "agentId": "uuid", "reason": "string (5-500), REQUIRED when the ticket already has an agent", "note": "string (≤1000)?" }
```
Rules: the agent must be `ACTIVE`, a member of the ticket's department (`department_members`) and hold effective `tickets.view_assigned`, else `422 AGENT_NOT_ELIGIBLE`.
Effects (one transaction): close the current `ticket_assignments` row (`unassignedAt`, `reason`), insert a new one (`assignedById = caller`), set `assignedAgentId`. Activity `ASSIGNED` or `REASSIGNED`.

#### `POST /tickets/:id/status`
`tickets.change_status` · scope. The only status the agent may set here is `IN_PROGRESS` (resolve, close, reopen, cancel and transfer have their own routes).
```jsonc
{ "status": "IN_PROGRESS", "note": "string (≤1000)?" }
```
Allowed: `ASSIGNED → IN_PROGRESS`, `REOPENED → IN_PROGRESS`. Activity `STATUS_CHANGED`.

#### `POST /tickets/:id/resolve`
`tickets.resolve` · scope. `IN_PROGRESS → RESOLVED`.
```jsonc
{ "resolution": "string (10-5000, required)" }
```
Sets `resolution`, `resolvedById`, `resolvedAt`. Activity `RESOLVED`. The requester can see the outcome.

#### `POST /tickets/:id/close`
`tickets.close` · scope. `RESOLVED → CLOSED`.
```jsonc
{ "note": "string (≤1000)?" }
```
Sets `closedAt`. Activity `CLOSED`.

#### `POST /tickets/:id/reopen`
`tickets.reopen` · scope (the requester qualifies through `view_own`). `RESOLVED | CLOSED → REOPENED`.
```jsonc
{ "reason": "string (5-1000, required)" }
```
Increments `reopenCount`, clears `closedAt`. Activity `REOPENED`.

#### `POST /tickets/:id/cancel`
**Requester only** (`tickets.update_own`). `PENDING_REVIEW | CLARIFICATION_REQUESTED | ACCEPTED → CANCELLED` (terminal).
```jsonc
{ "reason": "string (≤500)?" }
```
Activity `CANCELLED`.

#### `POST /tickets/:id/transfer`
`tickets.transfer_department` · scope. Allowed from any non-terminal status before `RESOLVED`.
```jsonc
{ "departmentId": "uuid (active, different from the current one)",
  "categoryId": "uuid (must belong to the destination department)",
  "reason": "string (5-500, required)" }
```
Effects: change department and category, reset to `PENDING_REVIEW`, close the current assignment, clear `assignedAgentId`. Activity `DEPARTMENT_TRANSFERRED` with from/to. Response is `200 { "data": { "id", "number", "reference", "status", "departmentId" } }`, **not** `TicketDetail`, because the caller may no longer have access to the ticket.

#### `GET /tickets/:id/comments`
Any `tickets.view_*` · scope. Query: `page`, `limit` (default 50), `kind` (`COMMENT`\|`WORK_NOTE`\|`CLARIFICATION`)?. Oldest first.
`200 { "data": [Comment], "meta": {…} }`. `WORK_NOTE` rows are returned **only** to callers who hold `tickets.view_work_notes` and have a staff scope. A requester-only viewer never receives them.

#### `POST /tickets/:id/comments`
`tickets.comment` · scope.
```jsonc
{ "body": "string (1-5000)", "kind": "COMMENT | WORK_NOTE (default COMMENT)" }
```
`WORK_NOTE` requires `tickets.view_work_notes` and staff scope, else `403`. Blocked on `CANCELLED`, `REJECTED`, `CLOSED` → `409 INVALID_STATE_TRANSITION`. `201 { "data": Comment }`. Activity `COMMENTED`. (`CLARIFICATION` comments are created only by the clarification routes.)

#### `PATCH /tickets/:id/comments/:commentId`
**Author only.** `{ "body": "string (1-5000)" }` → `200 { "data": Comment }` with `editedAt` set. Not allowed on `CLARIFICATION` comments.

#### `DELETE /tickets/:id/comments/:commentId`
Author, or a holder of `tickets.delete`. Soft delete. `204`.

#### `GET /tickets/:id/activity`
Any `tickets.view_*` · scope. Query: `page`, `limit` (default 50). Newest first.
`200 { "data": [Activity], "meta": {…} }`. Metadata of `WORK_NOTE`-related events is withheld from requester-only viewers.

#### `GET /tickets/:id/assignments`
**Staff scope only** (`view_assigned`, `view_department` or `view_all`). A requester-only caller gets `403`. `200 { "data": [Assignment] }`, newest first.

#### Attachments (optional; the assignment says "if supported")

Limits come from settings `attachments.max_size_mb` and `attachments.allowed_mime_types`. Store files outside the web root under an opaque `storageKey` (never the original name).

- `GET /tickets/:id/attachments`: scope. `200 { "data": [Attachment] }`.
- `POST /tickets/:id/attachments`: scope, and (`tickets.comment` or the requester). `multipart/form-data`: `file` (required, one file), `commentId` (uuid?). `201 { "data": Attachment }`. Errors: `400`, `413` (too large), `415` (type not allowed). Validate the real MIME type by content, not only the extension.
- `GET /tickets/:id/attachments/:attachmentId/download`: **same scope check as the ticket**. Streams the file with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- `DELETE /tickets/:id/attachments/:attachmentId`: uploader or `tickets.delete`. `204`.

---

### 3.8 Dashboard

Each widget group is its own route with its own permission. The frontend calls only the ones the user's permissions allow, and the backend enforces it. "Open" means any status except `RESOLVED`, `CLOSED`, `REJECTED`, `CANCELLED`. `recentlyUpdated` is the 5 latest by `updatedAt`.

#### `GET /dashboard/my-requests`
`tickets.view_own`
```jsonc
{ "data": { "total": 0, "open": 0, "pending": 0 /* PENDING_REVIEW + CLARIFICATION_REQUESTED */,
            "inProgress": 0, "resolved": 0, "byStatus": { "PENDING_REVIEW": 0 },
            "recentlyUpdated": [TicketSummary] } }
```

#### `GET /dashboard/my-work`
`tickets.view_assigned`
```jsonc
{ "data": { "assigned": 0, "open": 0, "inProgress": 0, "resolvedLast30Days": 0,
            "recentlyUpdated": [TicketSummary] } }
```

#### `GET /dashboard/department`
`tickets.view_department`. Query: `departmentId` (uuid?). Must be a department the caller manages (else `404`). Omitted → all managed departments.
```jsonc
{ "data": { "departments": [{
    "department": { "id": "uuid", "name": "string" },
    "totalRequests": 0, "pendingReview": 0, "clarificationRequested": 0,
    "unassignedAccepted": 0, "awaitingResolution": 0 /* ASSIGNED + IN_PROGRESS */,
    "byAgent": [{ "agent": UserRef, "open": 0, "resolved": 0 }],
    "avgResolutionHours": 0 /* null when fewer than 5 resolved tickets */, "resolvedSampleSize": 0 }] } }
```

#### `GET /dashboard/system`
`tickets.view_all`
```jsonc
{ "data": {
    "tickets": { "total": 0, "open": 0, "resolved": 0, "byStatus": { }, "byPriority": { } },
    "users":   { "total": 0, "active": 0, "supportAgents": 0 }   // ONLY present when the caller also holds users.view
} }
```
`supportAgents` = distinct active users listed in `department_members`. A caller with `tickets.view_all` but not `users.view` (an auditor) receives no `users` block: a dashboard permission must not leak other data.

---

### 3.9 Reports

All report data is computed **over the caller's visible tickets** (the same scope union as `GET /tickets`). Query dates default to the last 30 days.

#### `GET /reports/summary`
`reports.view`. Query: `from`, `to` (ISO date), `departmentId`?.
```jsonc
{ "data": { "period": { "from": "ISO", "to": "ISO" },
            "totals": { "created": 0, "resolved": 0, "closed": 0, "rejected": 0, "open": 0 },
            "byStatus": { }, "byPriority": { },
            "avgResolutionHours": 0, "reopenRate": 0.0 } }
```

#### `GET /reports/tickets`
`reports.view`. Query: `groupBy` (**required**: `status`\|`priority`\|`department`\|`category`\|`agent`\|`day`\|`week`\|`month`), `from`, `to`, `departmentId`?, `status`?, `priority`?.
`200 { "data": { "groupBy": "status", "rows": [{ "key": "string", "label": "string", "count": 0 }] } }`

#### `GET /reports/team-performance`
`reports.view`. Query: `from`, `to`, `departmentId`?.
Rows: `view_all` → all agents · `view_department` → agents of managed departments · otherwise only the caller's own row.
`200 { "data": { "rows": [{ "agent": UserRef, "assigned": 0, "resolved": 0, "open": 0, "reopened": 0, "avgResolutionHours": 0 }] } }`

#### `GET /reports/export`
`reports.export` (also `reports.view`). Query: `type` (`tickets`\|`team-performance`, required), `format` (`csv`, required), plus the same filters as the matching report.
`200 text/csv`, `Content-Disposition: attachment; filename="workdesk-<type>-<date>.csv"`. Guard against CSV injection: prefix any cell starting with `=`, `+`, `-` or `@` with `'`. Audit `reports.exported`. Rate-limited.

---

### 3.10 Audit logs

Read-only and append-only. There are no create, update or delete routes (a database trigger enforces this too). Never store passwords or tokens in `before`/`after`; redact them.

#### `GET /audit-logs`
`audit_logs.view`. Query: `page`, `limit`, `actorId`, `action` (exact, or a prefix ending in `.` such as `auth.`), `entityType`, `entityId`, `outcome` (`SUCCESS`\|`DENIED`\|`FAILURE`), `from`, `to`, `order` (sorted by `createdAt`).
`200 { "data": [AuditLog], "meta": {…} }`

#### `GET /audit-logs/:id`
`audit_logs.view`. `200 { "data": AuditLog }` (`:id` is a numeric string).

Event catalogue: see Appendix B.

---

### 3.11 Settings

Only whitelisted keys can be written, each with a type and range (Appendix C). Unknown keys → `404` on read, `400` on write.

#### `GET /settings`
`settings.view`. `200 { "data": [Setting] }`.

#### `GET /settings/:key`
`settings.view`. `200 { "data": Setting }`.

#### `PUT /settings/:key`
`settings.update`
```jsonc
{ "value": "<type depends on key>" }
```
`200 { "data": Setting }`. Errors: `400 VALIDATION_ERROR` (wrong type or out of range, or an unknown key). Audit `settings.updated` with before/after.

---

### 3.12 Lookups

Lightweight dropdown data so a screen does not need broad management permissions just to populate a field. Active records only, minimal fields, no pagination (capped).

#### `GET /lookups/departments`
`tickets.create` or `tickets.transfer_department` or `departments.view`. `200 { "data": [{ "id", "name", "code" }] }` (active departments).

#### `GET /lookups/categories`
`tickets.create` or `tickets.transfer_department` or `categories.view`. Query: `departmentId` (**required**). `200 { "data": [{ "id", "name", "isSensitive" }] }` (active only).

#### `GET /lookups/agents`
`tickets.assign`. Query: `departmentId` (**required**, must be in the caller's scope). Active members of that department who hold `tickets.view_assigned`.
`200 { "data": [{ "id", "firstName", "lastName", "email", "openTickets": 0 }] }` (workload helps the manager choose).

#### `GET /lookups/roles`
`users.assign_roles` or `users.create`. Active roles.
`200 { "data": [{ "id", "name", "description", "assignable": true }] }`. `assignable` is `false` when the role contains a permission the caller does not hold, so the UI can grey it out. The server still enforces it.

#### `GET /lookups/users`
`departments.manage_members`. Query: `search` (min 2 chars), `limit` (≤20). Active users.
`200 { "data": [UserRef] }`.

---

## Appendix A: Ticket state machine

| From | Action (route) | To | Permission | Extra rules |
|---|---|---|---|---|
| `PENDING_REVIEW` | `accept` | `ACCEPTED` | `tickets.accept` | |
| `PENDING_REVIEW` | `reject` | `REJECTED` | `tickets.reject` | reason required |
| `PENDING_REVIEW` | `request-clarification` | `CLARIFICATION_REQUESTED` | `tickets.request_clarification` | question required |
| `CLARIFICATION_REQUESTED` | `provide-clarification` | `PENDING_REVIEW` | `tickets.update_own` | requester only |
| `PENDING_REVIEW`, `CLARIFICATION_REQUESTED`, `ACCEPTED` | `cancel` | `CANCELLED` | `tickets.update_own` | requester only |
| `ACCEPTED`, `REOPENED` | `assign` | `ASSIGNED` | `tickets.assign` | agent eligible |
| `ASSIGNED`, `IN_PROGRESS` | `assign` | *(same)* | `tickets.assign` | reassignment, reason required |
| `ASSIGNED`, `REOPENED` | `status` | `IN_PROGRESS` | `tickets.change_status` | |
| `IN_PROGRESS` | `resolve` | `RESOLVED` | `tickets.resolve` | resolution required |
| `RESOLVED` | `close` | `CLOSED` | `tickets.close` | |
| `RESOLVED`, `CLOSED` | `reopen` | `REOPENED` | `tickets.reopen` | reason required |
| Any non-terminal state before `RESOLVED` | `transfer` | `PENDING_REVIEW` | `tickets.transfer_department` | reason, new category required |

`REJECTED` and `CANCELLED` are terminal. Anything not listed → `409 INVALID_STATE_TRANSITION` and nothing is written. Every transition runs inside one database transaction together with its activity row.

## Appendix B: Audit event catalogue (`audit_logs.action`)

| Area | Actions |
|---|---|
| Auth | `auth.login`, `auth.login_failed`, `auth.logout`, `auth.logout_all`, `auth.refresh_reuse_detected`, `auth.password_changed`, `auth.password_reset_requested`, `auth.password_reset_completed` |
| Users | `users.created`, `users.updated`, `users.deleted`, `users.activated`, `users.deactivated`, `users.roles_updated`, `users.password_reset`, `users.sessions_revoked` |
| Roles | `roles.created`, `roles.updated`, `roles.deleted`, `roles.permissions_updated` |
| Departments | `departments.created`, `departments.updated`, `departments.manager_added`, `departments.manager_removed`, `departments.members_added`, `departments.member_removed` |
| Tickets | `tickets.deleted`, `tickets.assigned`, `tickets.reassigned`, `tickets.transferred`, `tickets.accepted`, `tickets.rejected` |
| Reports / settings | `reports.exported`, `settings.updated` |
| Denied access | Any `403` from the permission guard or a privilege-escalation block is logged with `outcome = DENIED` and the attempted route in `after`. |

Routine ticket events (comments, status changes) live in `ticket_activity`, not in `audit_logs`.

## Appendix C: Whitelisted settings

| Key | Type / range | Default |
|---|---|---|
| `department.max_managers` | int 1-10 | 3 |
| `auth.max_failed_logins` | int 3-10 | 5 |
| `auth.lockout_minutes` | int 1-1440 | 15 |
| `attachments.max_size_mb` | int 1-25 | 5 |
| `attachments.allowed_mime_types` | string[] (`image/png`, `image/jpeg`, `application/pdf`, `text/plain`) | all four |

Token lifetimes and secrets are environment variables, not settings.

## Appendix D: The eight assignment scenarios mapped to routes

| # | Scenario | Routes exercised |
|---|---|---|
| 1 | Administrator login | `POST /auth/login`, `GET /auth/me`, `GET /users` |
| 2 | Create a "Read-Only Auditor" role with `tickets.view_all`, `reports.view`, `audit_logs.view` | `GET /permissions`, `POST /roles`, `PUT /roles/:id/permissions` |
| 3 | Assign the role to a user | `PUT /users/:id/roles` |
| 4 | Add `tickets.assign` to that role; the user can now assign | `PUT /roles/:id/permissions`, then `POST /tickets/:id/assign` |
| 5 | Backend rejects unauthorised access, IDOR | any protected route without the permission → `403`; another user's `GET /tickets/:id` → `404` |
| 6 | One user, multiple roles | `PUT /users/:id/roles` with two ids, then `GET /auth/me` shows the union |
| 7 | Revoke a permission | `PUT /roles/:id/permissions` without it; the user's next call → `403` |
| 8 | Deactivate a user | `POST /users/:id/deactivate`; their old token → `401 SESSION_REVOKED`; login → `401 INVALID_CREDENTIALS` |

## Appendix E: Suggested build order for the backend

1. Config, Prisma client, error envelope, request-id, health routes.
2. Seed: permissions, role bundles, departments, demo users.
3. Auth: login, refresh with rotation, logout, `/auth/me`, then the authenticate and permission guards.
4. Permissions, roles, users (with all safeguards), audit-log writer.
5. Departments, categories, ticket scope service.
6. Tickets: create, list, detail, then each workflow action with the state machine.
7. Comments, activity, assignments.
8. Dashboard, reports, audit-log reads, settings, lookups.
9. Tests for the eight scenarios, Swagger/OpenAPI, README.
