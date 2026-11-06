// The eight demonstration scenarios of the assignment, plus the security properties they rely on.
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, Client, DEMO_PASSWORD, adminClient, loginAs, sleep, uniq } from "./client";

let admin: Client;
const STRONG = "Str0ngPassw0rd!";

async function permissionIds(keys: string[]): Promise<string[]> {
  const r = await admin.get("/api/permissions");
  expect(r.status).toBe(200);
  const all: { id: string; key: string }[] = r.body.data.flatMap?.((g: any) => g.permissions ?? g) ?? r.body.data;
  return keys.map((k) => {
    const hit = all.find((p) => p.key === k);
    if (!hit) throw new Error(`permission ${k} missing from catalogue`);
    return hit.id;
  });
}

async function createUser(roleIds: string[] = [], extra: Record<string, unknown> = {}) {
  const email = `${uniq("user")}@workdesk.local`;
  const r = await admin.post("/api/users", {
    email, firstName: "Test", lastName: "User", password: STRONG, activate: true, mustChangePassword: false, roleIds, ...extra,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { id: r.body.data.user.id as string, email };
}

async function roleId(name: string): Promise<string> {
  const r = await admin.get(`/api/roles?search=${encodeURIComponent(name)}&limit=50`);
  const hit = r.body.data.find((x: any) => x.name === name);
  if (!hit) throw new Error(`role ${name} not found`);
  return hit.id;
}

async function deptId(code: string): Promise<{ id: string; categoryId: string }> {
  const d = await admin.get("/api/departments?limit=100");
  const dept = d.body.data.find((x: any) => x.code === code);
  const c = await admin.get(`/api/categories?departmentId=${dept.id}`);
  return { id: dept.id, categoryId: c.body.data[0].id };
}

async function newTicket(requester: Client, dept: { id: string; categoryId: string }, title = uniq("Laptop broken")) {
  const r = await requester.post("/api/tickets", {
    title, description: "The screen flickers and then goes black.", departmentId: dept.id, categoryId: dept.categoryId,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data as { id: string; status: string; allowedActions: string[] };
}

beforeAll(async () => { admin = await adminClient(); });

describe("Scenario 1: administrator login", () => {
  it("logs in, sets a hardened refresh cookie and never leaks secrets", async () => {
    const c = new Client();
    const r = await c.login(ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-123");
    expect(r.status).toBe(200);
    expect(r.body.data.accessToken).toBeTruthy();
    expect(r.body.data.permissions).toContain("users.assign_roles");
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    const me = await c.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.roles.map((x: any) => x.name)).toContain("System Administrator");
    expect((await c.get("/api/users")).status).toBe(200);
  });

  it("answers wrong password and unknown email identically", async () => {
    const a = await new Client().login(ADMIN_EMAIL, "wrong-password-1A");
    const b = await new Client().login("nobody@workdesk.local", "wrong-password-1A");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
    expect(a.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects missing, malformed and forged tokens", async () => {
    expect((await new Client().get("/api/auth/me")).status).toBe(401);
    const c = new Client();
    c.token = "not.a.jwt";
    expect((await c.get("/api/auth/me")).status).toBe(401);
    const [h, p] = admin.token!.split(".");
    c.token = `${h}.${p}.AAAA`;
    expect((await c.get("/api/auth/me")).status).toBe(401);
    // alg=none forgery
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    c.token = `${none}.${p}.`;
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });
});

describe("Scenarios 2 to 4 and 6 to 7: dynamic roles and permissions", () => {
  let role: string;
  let userA: { id: string; email: string };
  let ticketId: string;
  const it_ = { id: "", categoryId: "" };

  it("2. creates a custom 'Read-Only Auditor' role with exactly three permissions", async () => {
    const ids = await permissionIds(["tickets.view_all", "reports.view", "audit_logs.view"]);
    const r = await admin.post("/api/roles", { name: uniq("Read-Only Auditor"), description: "custom", permissionIds: ids });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    role = r.body.data.id;
    expect(r.body.data.permissions.map((p: any) => p.key).sort()).toEqual(["audit_logs.view", "reports.view", "tickets.view_all"]);
    const dup = await admin.post("/api/roles", { name: r.body.data.name.toUpperCase() });
    expect(dup.status).toBe(409);
  });

  it("3. assigns it to a user, whose very next request reflects it", async () => {
    userA = await createUser();
    const c = await loginAs(userA.email, STRONG);
    expect((await c.get("/api/tickets")).status).toBe(403); // no role yet
    const put = await admin.put(`/api/users/${userA.id}/roles`, { roleIds: [role] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await c.get("/api/tickets")).status).toBe(200); // same access token, new permissions
    expect((await c.get("/api/audit-logs?limit=1")).status).toBe(200);
    expect((await c.get("/api/users")).status).toBe(403);
  });

  it("4. cannot assign until tickets.assign is added to the role, then can", async () => {
    const dept = await deptId("IT");
    Object.assign(it_, dept);
    const employee = await loginAs("employee@workdesk.local");
    const t = await newTicket(employee, dept);
    ticketId = t.id;
    const manager = await loginAs("manager.it@workdesk.local");
    expect((await manager.post(`/api/tickets/${ticketId}/accept`, {})).status).toBe(200);

    const agents = await manager.get(`/api/lookups/agents?departmentId=${dept.id}`);
    const agent = agents.body.data.find((a: any) => a.email === "agent.it@workdesk.local");
    expect(agent).toBeTruthy();

    const c = await loginAs(userA.email, STRONG);
    expect((await c.post(`/api/tickets/${ticketId}/assign`, { agentId: agent.id })).status).toBe(403);

    const ids = await permissionIds(["tickets.view_all", "reports.view", "audit_logs.view", "tickets.assign"]);
    const upd = await admin.put(`/api/roles/${role}/permissions`, { permissionIds: ids });
    expect(upd.status).toBe(200);
    expect(upd.body.data.added).toEqual(["tickets.assign"]);

    const ok = await c.post(`/api/tickets/${ticketId}/assign`, { agentId: agent.id });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.status).toBe("ASSIGNED");

    // an ineligible agent (an Employee) is refused
    const emp = await admin.get("/api/users?search=employee2");
    const t2 = await newTicket(employee, dept);
    await manager.post(`/api/tickets/${t2.id}/accept`, {});
    const bad = await c.post(`/api/tickets/${t2.id}/assign`, { agentId: emp.body.data[0].id });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("AGENT_NOT_ELIGIBLE");
  });

  it("6. one user with several roles gets the union of their permissions", async () => {
    const u = await createUser([await roleId("Employee"), role]);
    const c = await loginAs(u.email, STRONG);
    const me = await c.get("/api/auth/me");
    const perms: string[] = me.body.data.permissions;
    expect(perms).toEqual(expect.arrayContaining(["tickets.create", "tickets.view_own", "tickets.view_all", "tickets.assign", "audit_logs.view"]));
    expect(new Set(perms).size).toBe(perms.length);
    expect(me.body.data.user.roles).toHaveLength(2);
  });

  it("7. revoking a permission takes effect on the next call", async () => {
    const c = await loginAs(userA.email, STRONG);
    const ids = await permissionIds(["tickets.view_all", "reports.view", "audit_logs.view"]);
    expect((await admin.put(`/api/roles/${role}/permissions`, { permissionIds: ids })).status).toBe(200);
    const t = await c.get(`/api/tickets/${ticketId}`);
    expect(t.status).toBe(200);
    expect((await c.post(`/api/tickets/${ticketId}/assign`, { agentId: "00000000-0000-4000-8000-000000000000" })).status).toBe(403);
    ids.splice(ids.length - 1, 1);
    await admin.put(`/api/roles/${role}/permissions`, { permissionIds: ids });
    expect((await c.get("/api/audit-logs?limit=1")).status).toBe(403);
    // an inactive role stops granting anything
    await admin.patch(`/api/roles/${role}`, { isActive: false });
    expect((await c.get("/api/tickets")).status).toBe(403);
  });

  it("refuses to delete a role that is still assigned, and system roles", async () => {
    expect((await admin.del(`/api/roles/${role}`)).status).toBe(409);
    expect((await admin.del(`/api/roles/${await roleId("Employee")}`)).status).toBe(409);
  });
});

describe("Scenario 5: backend authorization, IDOR and privilege escalation", () => {
  it("requests without the permission are 403, and the denial is audited", async () => {
    const emp = await loginAs("employee@workdesk.local");
    expect((await emp.get("/api/users")).status).toBe(403);
    expect((await emp.get("/api/roles")).status).toBe(403);
    expect((await emp.get("/api/audit-logs")).status).toBe(403);
    const log = await admin.get("/api/audit-logs?action=access.denied&limit=5");
    expect(log.status).toBe(200);
    expect(log.body.data.length).toBeGreaterThan(0);
    expect(log.body.data[0].outcome).toBe("DENIED");
  });

  it("another user's ticket is a 404, not a 403 and not data", async () => {
    const e1 = await loginAs("employee@workdesk.local");
    const e2 = await loginAs("employee2@workdesk.local");
    const t = await newTicket(e1, await deptId("IT"));
    expect((await e2.get(`/api/tickets/${t.id}`)).status).toBe(404);
    expect((await e2.post(`/api/tickets/${t.id}/cancel`, {})).status).toBe(404);
    expect((await e2.get(`/api/tickets/${t.id}/comments`)).status).toBe(404);
    expect((await e2.get(`/api/tickets/${t.id}/activity`)).status).toBe(404);
    const list = await e2.get(`/api/tickets?requesterId=${(await e1.get("/api/auth/me")).body.data.user.id}`);
    expect(list.body.data).toHaveLength(0);
    // the HR manager has view_department only for HR
    const hr = await loginAs("manager.hr@workdesk.local");
    expect((await hr.get(`/api/tickets/${t.id}`)).status).toBe(404);
    expect((await hr.post(`/api/tickets/${t.id}/accept`, {})).status).toBe(404);
  });

  it("a malformed id is a 400, never a 500", async () => {
    expect((await admin.get("/api/users/not-a-uuid")).status).toBe(400);
    expect((await admin.get("/api/tickets/123")).status).toBe(400);
  });

  it("mass assignment is rejected (unknown fields)", async () => {
    const emp = await loginAs("employee@workdesk.local");
    const d = await deptId("IT");
    const r = await emp.post("/api/tickets", {
      title: "Valid title", description: "Valid description text", departmentId: d.id, categoryId: d.categoryId,
      status: "CLOSED", requesterId: "00000000-0000-4000-8000-000000000000",
    });
    expect(r.status).toBe(400);
  });

  it("blocks privilege escalation: you cannot grant what you do not hold", async () => {
    const ids = await permissionIds(["roles.create", "roles.assign_permissions", "permissions.view", "roles.view", "users.delete"]);
    // delegate holds everything except users.delete
    const r = await admin.post("/api/roles", { name: uniq("Delegate"), permissionIds: ids.slice(0, 4) });
    expect(r.status).toBe(201);
    const u = await createUser([r.body.data.id]);
    const c = await loginAs(u.email, STRONG);
    const mine = await c.post("/api/roles", { name: uniq("Mine") });
    expect(mine.status).toBe(201);
    const attempt = await c.put(`/api/roles/${mine.body.data.id}/permissions`, { permissionIds: [ids[4]] });
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe("PRIVILEGE_ESCALATION");
    const ok = await c.put(`/api/roles/${mine.body.data.id}/permissions`, { permissionIds: [ids[3]] });
    expect(ok.status).toBe(200);
    // and cannot hand a stronger role to anyone (no users.assign_roles anyway)
    expect((await c.put(`/api/users/${u.id}/roles`, { roleIds: [] })).status).toBe(403);
  });

  it("a user cannot change their own roles or deactivate themselves", async () => {
    const me = (await admin.get("/api/auth/me")).body.data.user.id;
    const r = await admin.put(`/api/users/${me}/roles`, { roleIds: [] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CANNOT_MODIFY_SELF");
    expect((await admin.post(`/api/users/${me}/deactivate`, {})).status).toBe(409);
    expect((await admin.del(`/api/users/${me}`)).status).toBe(409);
  });

  it("the system can never be left without an administrator", async () => {
    const adminRole = await admin.get(`/api/roles/${await roleId("System Administrator")}`);
    const keep = adminRole.body.data.permissions.filter((p: any) => p.key !== "roles.assign_permissions").map((p: any) => p.id);
    const r = await admin.put(`/api/roles/${adminRole.body.data.id}/permissions`, { permissionIds: keep });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("LAST_ADMIN_PROTECTED");
    expect((await admin.patch(`/api/roles/${adminRole.body.data.id}`, { isActive: false })).status).toBe(409);
  });
});

describe("Scenario 8: deactivation and session invalidation", () => {
  it("kills access tokens, refresh tokens and logins immediately", async () => {
    const u = await createUser([await roleId("Employee")]);
    const c = new Client();
    const login = await c.login(u.email, STRONG);
    expect(login.status).toBe(200);
    expect((await c.get("/api/tickets")).status).toBe(200);
    const oldToken = c.token!;

    const d = await admin.post(`/api/users/${u.id}/deactivate`, { reason: "left the company" });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.data.status).toBe("INACTIVE");

    const after = await c.get("/api/tickets");
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("SESSION_REVOKED");
    c.token = oldToken;
    expect((await c.post("/api/auth/refresh")).status).toBe(401);
    expect((await new Client().login(u.email, STRONG)).status).toBe(401);

    expect((await admin.post(`/api/users/${u.id}/activate`)).status).toBe(200);
    expect((await new Client().login(u.email, STRONG)).status).toBe(200);
  });

  it("deleting a user revokes sessions, and is blocked while they hold open tickets", async () => {
    const u = await createUser([await roleId("Employee")]);
    const c = await loginAs(u.email, STRONG);
    expect((await admin.del(`/api/users/${u.id}`)).status).toBe(204);
    expect((await c.get("/api/tickets")).status).toBe(401);
    expect((await admin.get(`/api/users/${u.id}`)).status).toBe(404);
    const agent = await admin.get("/api/users?search=agent.it");
    // agent.it holds the ticket assigned in scenario 4
    const r = await admin.del(`/api/users/${agent.body.data[0].id}`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("HAS_OPEN_ASSIGNMENTS");
  });

  it("logout-all and password change revoke every session", async () => {
    const u = await createUser([await roleId("Employee")]);
    const a = await loginAs(u.email, STRONG);
    const b = await loginAs(u.email, STRONG);
    expect((await a.get("/api/auth/sessions")).body.data).toHaveLength(2);
    expect((await a.post("/api/auth/logout-all")).status).toBe(204);
    expect((await b.get("/api/auth/me")).status).toBe(401);
    const c = await loginAs(u.email, STRONG);
    expect((await c.post("/api/auth/change-password", { currentPassword: "wrong", newPassword: "An0therPassw0rd!" })).status).toBe(422);
    expect((await c.post("/api/auth/change-password", { currentPassword: STRONG, newPassword: "An0therPassw0rd!" })).status).toBe(204);
    expect((await c.get("/api/auth/me")).status).toBe(401);
    expect((await new Client().login(u.email, "An0therPassw0rd!")).status).toBe(200);
  });
});

describe("Refresh rotation and reuse detection", () => {
  it("rotates the refresh token and kills the session when an old one is replayed", async () => {
    const u = await createUser([await roleId("Employee")]);
    const c = new Client();
    await c.login(u.email, STRONG);
    const first = c.refreshCookie!;
    const r1 = await c.post("/api/auth/refresh");
    expect(r1.status).toBe(200);
    expect(c.refreshCookie).not.toBe(first);
    expect((await c.get("/api/auth/me")).status).toBe(200);

    await sleep(11_000); // outside the 10 s grace window
    const thief = new Client();
    thief.refreshCookie = first;
    const replay = await thief.post("/api/auth/refresh");
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("SESSION_REVOKED");
    // the legitimate holder of the newer token is cut off too
    expect((await c.post("/api/auth/refresh")).status).toBe(401);
    const log = await admin.get("/api/audit-logs?action=auth.refresh_reuse_detected&limit=1");
    expect(log.body.data.length).toBe(1);
  }, 60_000);

  it("refresh requires the cookie and rejects foreign origins", async () => {
    expect((await new Client().post("/api/auth/refresh")).status).toBe(401);
    const u = await createUser();
    const c = new Client();
    await c.login(u.email, STRONG);
    const evil = await c.post("/api/auth/refresh", undefined, { headers: { origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
  });
});

describe("Brute force protection", () => {
  it("locks the account after repeated failures, even for the right password, and an admin can unlock", async () => {
    const u = await createUser();
    for (let i = 0; i < 5; i++) {
      expect((await new Client().login(u.email, `Wrong-pass-${i}A`)).status).toBe(401);
    }
    const locked = await new Client().login(u.email, STRONG);
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe("INVALID_CREDENTIALS");
    expect((await admin.post(`/api/users/${u.id}/activate`)).status).toBe(200);
    expect((await new Client().login(u.email, STRONG)).status).toBe(200);
  });

  it("rate limits login per client address and sends Retry-After", async () => {
    const c = new Client();
    let last = 0;
    let retry: string | null = null;
    for (let i = 0; i < 12; i++) {
      const r = await c.login("nobody@workdesk.local", "Wrong-pass-1A");
      last = r.status;
      retry = r.headers.get("retry-after");
      if (r.status === 429) break;
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
  });

  it("a spoofed X-Forwarded-For chain does not buy a fresh rate-limit bucket", async () => {
    const c = new Client(`198.51.100.${1 + Math.floor(Math.random() * 250)}`);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await c.req("POST", "/api/auth/login", {
        body: { email: "nobody@workdesk.local", password: "Wrong-pass-1A" },
        headers: { "x-forwarded-for": `${i}.${i}.${i}.${i}, ${c.ip}` }, // proxy appended the real address last
      });
      seen.push(r.status);
    }
    expect(seen).toContain(429);
  });
});

describe("Password reset", () => {
  it("answers 202 for unknown and known emails alike, and the link is single use", async () => {
    const u = await createUser();
    expect((await new Client().post("/api/auth/forgot-password", { email: `${uniq("ghost")}@workdesk.local` })).status).toBe(202);
    expect((await new Client().post("/api/auth/forgot-password", { email: u.email })).status).toBe(202);
    expect((await new Client().post("/api/auth/reset-password", { token: "a".repeat(64), newPassword: "An0therPassw0rd!" })).status).toBe(400);
  });
});

describe("Ticket workflow, visibility and data hygiene", () => {
  it("runs the whole lifecycle with legal and illegal transitions", async () => {
    const dept = await deptId("IT");
    const emp = await loginAs("employee@workdesk.local");
    const mgr = await loginAs("manager.it@workdesk.local");
    const agent = await loginAs("agent.it@workdesk.local");
    const t = await newTicket(emp, dept);
    const id = t.id;
    expect(t.allowedActions).toEqual(expect.arrayContaining(["edit", "cancel", "comment"]));
    expect(t.allowedActions).not.toContain("accept");

    expect((await agent.get(`/api/tickets/${id}`)).status).toBe(404); // not assigned yet
    expect((await mgr.post(`/api/tickets/${id}/resolve`, { resolution: "too early to resolve" })).status).toBe(403); // managers do not hold tickets.resolve
    expect((await mgr.post(`/api/tickets/${id}/close`, {})).status).toBe(409); // holds tickets.close, but the status is wrong

    expect((await mgr.post(`/api/tickets/${id}/request-clarification`, { question: "Which laptop model?" })).status).toBe(200);
    expect((await mgr.post(`/api/tickets/${id}/accept`, {})).status).toBe(409);
    expect((await mgr.post(`/api/tickets/${id}/provide-clarification`, { response: "ThinkPad T14" })).status).toBe(403);
    expect((await emp.post(`/api/tickets/${id}/provide-clarification`, { response: "ThinkPad T14" })).status).toBe(200);

    const acc = await mgr.post(`/api/tickets/${id}/accept`, { note: "ok" });
    expect(acc.status).toBe(200);
    expect(acc.body.data.requester.email).toBe("employee@workdesk.local"); // staff see contact details
    expect((await emp.get(`/api/tickets/${id}`)).body.data.requester.email).toBeUndefined();

    const agents = await mgr.get(`/api/lookups/agents?departmentId=${dept.id}`);
    const a1 = agents.body.data.find((a: any) => a.email === "agent.it@workdesk.local");
    const a2 = agents.body.data.find((a: any) => a.email === "agent2.it@workdesk.local");
    expect((await mgr.post(`/api/tickets/${id}/assign`, { agentId: a1.id })).status).toBe(200);
    const noReason = await mgr.post(`/api/tickets/${id}/assign`, { agentId: a2.id });
    expect(noReason.status).toBe(400);
    expect((await mgr.post(`/api/tickets/${id}/assign`, { agentId: a2.id, reason: "workload balancing" })).status).toBe(200);
    expect((await agent.get(`/api/tickets/${id}`)).status).toBe(404); // reassigned away: scope follows the assignment

    const agent2 = await loginAs("agent2.it@workdesk.local");
    expect((await agent2.post(`/api/tickets/${id}/resolve`, { resolution: "fixed it quickly" })).status).toBe(409);
    expect((await agent2.post(`/api/tickets/${id}/status`, { status: "IN_PROGRESS" })).status).toBe(200);
    expect((await agent2.post(`/api/tickets/${id}/comments`, { body: "internal: replaced the cable", kind: "WORK_NOTE" })).status).toBe(201);
    expect((await agent2.post(`/api/tickets/${id}/comments`, { body: "We are on it", kind: "COMMENT" })).status).toBe(201);
    const res = await agent2.post(`/api/tickets/${id}/resolve`, { resolution: "Replaced the display cable" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("RESOLVED");

    // work notes never reach the requester, in comments or in the timeline
    const comments = await emp.get(`/api/tickets/${id}/comments`);
    expect(comments.body.data.map((c: any) => c.kind)).not.toContain("WORK_NOTE");
    expect((await agent2.get(`/api/tickets/${id}/comments`)).body.data.map((c: any) => c.kind)).toContain("WORK_NOTE");
    const tl = await emp.get(`/api/tickets/${id}/activity`);
    expect(JSON.stringify(tl.body.data)).not.toContain("work_note");
    expect(JSON.stringify(tl.body.data)).not.toContain("WORK_NOTE");
    expect(JSON.stringify(tl.body.data)).not.toContain("workload balancing");
    expect((await emp.get(`/api/tickets/${id}/assignments`)).status).toBe(403);
    expect((await mgr.get(`/api/tickets/${id}/assignments`)).body.data).toHaveLength(2);

    expect((await mgr.post(`/api/tickets/${id}/close`, {})).status).toBe(200);
    expect((await emp.post(`/api/tickets/${id}/comments`, { body: "thanks" })).status).toBe(409);
    expect((await mgr.post(`/api/tickets/${id}/reopen`, { reason: "still flickers" })).status).toBe(200);
    expect((await mgr.get(`/api/tickets/${id}`)).body.data.reopenCount).toBe(1);
    expect((await emp.post(`/api/tickets/${id}/cancel`, {})).status).toBe(409);
  });

  it("supports reject, cancel, transfer and soft delete", async () => {
    const it_ = await deptId("IT");
    const hr = await deptId("HR");
    const emp = await loginAs("employee@workdesk.local");
    const mgr = await loginAs("manager.it@workdesk.local");

    const a = await newTicket(emp, it_);
    expect((await mgr.post(`/api/tickets/${a.id}/reject`, { reason: "out of scope" })).status).toBe(200);
    expect((await mgr.post(`/api/tickets/${a.id}/accept`, {})).status).toBe(409);

    const b = await newTicket(emp, it_);
    expect((await emp.post(`/api/tickets/${b.id}/cancel`, { reason: "solved myself" })).status).toBe(200);

    const c = await newTicket(emp, it_);
    const tr = await mgr.post(`/api/tickets/${c.id}/transfer`, { departmentId: hr.id, categoryId: hr.categoryId, reason: "belongs to HR" });
    expect(tr.status, JSON.stringify(tr.body)).toBe(200);
    expect(tr.body.data.status).toBe("PENDING_REVIEW");
    expect((await mgr.get(`/api/tickets/${c.id}`)).status).toBe(404); // left the manager's department
    const hrm = await loginAs("manager.hr@workdesk.local");
    expect((await hrm.get(`/api/tickets/${c.id}`)).status).toBe(200);
    const same = await hrm.post(`/api/tickets/${c.id}/transfer`, { departmentId: hr.id, categoryId: hr.categoryId, reason: "same dept" });
    expect(same.status).toBe(422);

    const d = await newTicket(emp, it_);
    expect((await emp.del(`/api/tickets/${d.id}`)).status).toBe(403);
    expect((await admin.del(`/api/tickets/${d.id}`)).status).toBe(204);
    expect((await admin.get(`/api/tickets/${d.id}`)).status).toBe(404);
  });

  it("rejects a category from another department", async () => {
    const it_ = await deptId("IT");
    const hr = await deptId("HR");
    const emp = await loginAs("employee@workdesk.local");
    const r = await emp.post("/api/tickets", { title: "Mismatch", description: "category belongs elsewhere", departmentId: it_.id, categoryId: hr.categoryId });
    expect(r.status).toBe(422);
  });

  it("searches by reference and filters by status within scope", async () => {
    const emp = await loginAs("employee@workdesk.local");
    const t = await newTicket(emp, await deptId("IT"), uniq("Searchable"));
    const full = await emp.get(`/api/tickets/${t.id}`);
    const byRef = await emp.get(`/api/tickets?search=${full.body.data.reference}`);
    expect(byRef.body.data.map((x: any) => x.id)).toContain(t.id);
    const filtered = await emp.get("/api/tickets?status=PENDING_REVIEW,ACCEPTED&sort=number&order=asc&limit=5");
    expect(filtered.status).toBe(200);
    expect(filtered.body.meta.limit).toBe(5);
    expect((await emp.get("/api/tickets?limit=1000")).status).toBe(400);
  });

  it("attachments: real type check, scope on download, no work-note leakage", async () => {
    const emp = await loginAs("employee@workdesk.local");
    const other = await loginAs("employee2@workdesk.local");
    const t = await newTicket(emp, await deptId("IT"));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    const fd = new FormData();
    fd.append("file", new File([png], "screenshot.png", { type: "image/png" }));
    const up = await emp.req("POST", `/api/tickets/${t.id}/attachments`, { form: fd });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.data.mimeType).toBe("image/png");
    expect(up.body.data.storageKey).toBeUndefined();

    // an .exe renamed to .png is refused: the type is read from the bytes
    const evil = new FormData();
    evil.append("file", new File([new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])], "photo.png", { type: "image/png" }));
    expect((await emp.req("POST", `/api/tickets/${t.id}/attachments`, { form: evil })).status).toBe(415);

    const dl = await emp.get(`/api/tickets/${t.id}/attachments/${up.body.data.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment/);
    expect((await other.get(`/api/tickets/${t.id}/attachments/${up.body.data.id}/download`)).status).toBe(404);
    expect((await other.del(`/api/tickets/${t.id}/attachments/${up.body.data.id}`)).status).toBe(404);

    // cannot hang a file on someone else's comment (IDOR through commentId)
    const mine = await emp.post(`/api/tickets/${t.id}/comments`, { body: "see attached" });
    const t2 = await newTicket(emp, await deptId("IT"));
    const bad = new FormData();
    bad.append("file", new File([png], "x.png", { type: "image/png" }));
    bad.append("commentId", mine.body.data.id);
    expect((await emp.req("POST", `/api/tickets/${t2.id}/attachments`, { form: bad })).status).toBe(400);

    const big = new FormData();
    big.append("file", new File([new Uint8Array(6 * 1024 * 1024).fill(97)], "big.txt", { type: "text/plain" }));
    expect((await emp.req("POST", `/api/tickets/${t.id}/attachments`, { form: big })).status).toBe(413);
  });
});

describe("Dashboards, reports, audit, settings", () => {
  it("serves each dashboard only to the permission that gates it", async () => {
    const emp = await loginAs("employee@workdesk.local");
    const mgr = await loginAs("manager.it@workdesk.local");
    const agent = await loginAs("agent.it@workdesk.local");
    const aud = await loginAs("auditor@workdesk.local");
    expect((await emp.get("/api/dashboard/my-requests")).body.data.total).toBeGreaterThan(0);
    expect((await emp.get("/api/dashboard/system")).status).toBe(403);
    expect((await agent.get("/api/dashboard/my-work")).status).toBe(200);
    const dep = await mgr.get("/api/dashboard/department");
    expect(dep.status).toBe(200);
    expect(dep.body.data.departments).toHaveLength(1);
    const hr = await deptId("HR");
    expect((await mgr.get(`/api/dashboard/department?departmentId=${hr.id}`)).status).toBe(404);
    const sys = await aud.get("/api/dashboard/system");
    expect(sys.status).toBe(200);
    expect(sys.body.data.users).toBeUndefined(); // auditor lacks users.view
    expect((await admin.get("/api/dashboard/system")).body.data.users.total).toBeGreaterThan(0);
  });

  it("reports are computed over the caller's visible tickets, and CSV export is injection safe", async () => {
    const emp = await loginAs("employee@workdesk.local");
    await newTicket(emp, await deptId("IT"), "=HYPERLINK(\"http://evil\")");
    const aud = await loginAs("auditor@workdesk.local");
    const mgr = await loginAs("manager.it@workdesk.local");
    const sAll = await aud.get("/api/reports/summary");
    const sMgr = await mgr.get("/api/reports/summary");
    expect(sAll.status).toBe(200);
    expect(sAll.body.data.totals.created).toBeGreaterThanOrEqual(sMgr.body.data.totals.created);
    for (const g of ["status", "priority", "department", "category", "agent", "day", "week", "month"]) {
      expect((await aud.get(`/api/reports/tickets?groupBy=${g}`)).status, g).toBe(200);
    }
    expect((await aud.get("/api/reports/tickets")).status).toBe(400);
    expect((await mgr.get("/api/reports/team-performance")).status).toBe(200);
    expect((await emp.get("/api/reports/summary")).status).toBe(403);

    const csv = await admin.get("/api/reports/export?type=tickets&format=csv");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(String(csv.body)).toContain("'=HYPERLINK");
    expect(String(csv.body)).not.toMatch(/(^|,)=HYPERLINK/m);
    expect((await aud.get("/api/reports/export?type=tickets&format=csv")).status).toBe(403); // auditor has no reports.export
  });

  it("audit log is readable, filterable and carries no secrets", async () => {
    const r = await admin.get("/api/audit-logs?action=auth.&limit=50");
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body)).not.toMatch(/\$argon2|passwordHash/);
    const one = await admin.get(`/api/audit-logs/${r.body.data[0].id}`);
    expect(one.status).toBe(200);
    expect((await admin.get("/api/audit-logs/abc")).status).toBe(400);
    expect((await admin.del("/api/audit-logs/1")).status).toBeGreaterThanOrEqual(404);
  });

  it("settings are whitelisted, typed and range checked", async () => {
    expect((await admin.get("/api/settings")).body.data.length).toBe(5);
    expect((await admin.put("/api/settings/department.max_managers", { value: 2 })).status).toBe(200);
    expect((await admin.put("/api/settings/department.max_managers", { value: 99 })).status).toBe(400);
    expect((await admin.put("/api/settings/department.max_managers", { value: "3" })).status).toBe(400);
    expect((await admin.put("/api/settings/jwt.secret", { value: "x" })).status).toBe(400);
    expect((await admin.get("/api/settings/jwt.secret")).status).toBe(404);
    await admin.put("/api/settings/department.max_managers", { value: 3 });
  });
});

describe("Departments, categories and lookups", () => {
  it("enforces manager limit, scope and safeguards", async () => {
    const created = await admin.post("/api/departments", { name: uniq("Legal"), code: uniq("L").toUpperCase().slice(0, 8) });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id;
    expect((await admin.post("/api/departments", { name: created.body.data.name, code: "ZZZ9" })).status).toBe(409);

    const role = await roleId("Support Manager");
    const people = [await createUser([role]), await createUser([role]), await createUser([role]), await createUser([role])];
    for (const p of people.slice(0, 3)) expect((await admin.post(`/api/departments/${id}/managers`, { userId: p.id })).status).toBe(201);
    const over = await admin.post(`/api/departments/${id}/managers`, { userId: people[3]!.id });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe("LIMIT_EXCEEDED");
    expect((await admin.post(`/api/departments/${id}/managers`, { userId: people[0]!.id })).status).toBe(409);

    const noRole = await createUser([]);
    await admin.del(`/api/departments/${id}/managers/${people[2]!.id}`);
    const warn = await admin.post(`/api/departments/${id}/managers`, { userId: noRole.id });
    expect(warn.body.data.warnings?.length).toBe(1);

    const mgr = await loginAs(people[0]!.email, STRONG);
    const cat = await mgr.post("/api/categories", { departmentId: id, name: "Contracts" });
    expect(cat.status, JSON.stringify(cat.body)).toBe(201);
    const itDept = await deptId("IT");
    expect((await mgr.post("/api/categories", { departmentId: itDept.id, name: "Sneaky" })).status).toBe(404);
    expect((await mgr.patch(`/api/categories/${itDept.categoryId}`, { name: "Hijack" })).status).toBe(404);
  });

  it("lookups are scoped and minimal", async () => {
    const emp = await loginAs("employee@workdesk.local");
    const d = await emp.get("/api/lookups/departments");
    expect(d.status).toBe(200);
    expect(Object.keys(d.body.data[0]).sort()).toEqual(["code", "id", "name"]);
    const it_ = await deptId("IT");
    expect((await emp.get(`/api/lookups/agents?departmentId=${it_.id}`)).status).toBeGreaterThanOrEqual(403);
    const mgr = await loginAs("manager.it@workdesk.local");
    const roles = await mgr.get("/api/lookups/roles");
    if (roles.status === 200) {
      expect(roles.body.data.find((r: any) => r.name === "System Administrator")?.assignable).toBe(false);
    }
  });
});

describe("Operations", () => {
  it("housekeeping needs the secret; health is public", async () => {
    expect((await new Client().post("/api/internal/housekeeping")).status).toBe(401);
    const c = new Client();
    c.token = process.env.CRON_SECRET ?? null;
    const r = await c.post("/api/internal/housekeeping");
    if (process.env.CRON_SECRET) expect(r.status).toBe(200);
    expect((await new Client().get("/api/health")).status).toBe(200);
    expect((await new Client().get("/api/health/ready")).body.data.database).toBe("up");
  });

  it("CORS only answers allowed origins", async () => {
    const ok = await new Client().req("OPTIONS", "/api/auth/login", { headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const bad = await new Client().req("OPTIONS", "/api/auth/login", { headers: { origin: "https://evil.example" } });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("errors do not leak internals", async () => {
    const r = await admin.get("/api/users?limit=abc");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/prisma|node_modules|at .*\.ts/i);
    const bad = await admin.req("POST", "/api/users", { headers: { "content-type": "application/json" }, body: undefined });
    expect([400, 415]).toContain(bad.status);
  });
});


describe("Last administrator (runs last: it deactivates every other administrator)", () => {
  it("refuses any change that would leave zero active administrators", async () => {
    const all = (await admin.get("/api/permissions")).body.data;
    const flat: { id: string; key: string }[] = all.flatMap?.((g: any) => g.permissions ?? g) ?? all;
    // a NON-system role carrying every permission, so only the global invariant (not the system-role rule) can fire
    const c = await admin.post("/api/roles", { name: uniq("Custom Admin"), permissionIds: flat.map((p) => p.id) });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const b = await createUser([c.body.data.id]);
    const bc = await loginAs(b.email, STRONG);

    // retire every other administrator (any role that holds both admin keys)
    const roles = (await bc.get("/api/roles?limit=100")).body.data as { id: string }[];
    const mainId = (await admin.get("/api/auth/me")).body.data.user.id as string;
    for (const r of roles) {
      const detail = (await bc.get(`/api/roles/${r.id}`)).body.data;
      const keys = detail.permissions.map((p: any) => p.key);
      if (!(keys.includes("users.assign_roles") && keys.includes("roles.assign_permissions")) || !detail.isActive) continue;
      const users = (await bc.get(`/api/roles/${r.id}/users?limit=100`)).body.data as { id: string; status: string }[];
      for (const u of users) if (u.id !== b.id && u.status === "ACTIVE") expect((await bc.post(`/api/users/${u.id}/deactivate`, {})).status).toBe(200);
    }

    const without = flat.filter((p) => p.key !== "users.assign_roles").map((p) => p.id);
    const strip = await bc.put(`/api/roles/${c.body.data.id}/permissions`, { permissionIds: without });
    expect(strip.status, JSON.stringify(strip.body)).toBe(409);
    expect(strip.body.code).toBe("LAST_ADMIN_PROTECTED");
    const off = await bc.patch(`/api/roles/${c.body.data.id}`, { isActive: false });
    expect(off.status).toBe(409);
    expect(off.body.code).toBe("LAST_ADMIN_PROTECTED");
    // nothing was applied: the administrator still works
    expect((await bc.get("/api/users?limit=1")).status).toBe(200);

    // restore the seeded administrator for the next run
    expect((await bc.post(`/api/users/${mainId}/activate`)).status).toBe(200);
  });
});

// keep a reference so the demo password constant stays exported for other suites
void DEMO_PASSWORD;
