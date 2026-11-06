// Idempotent seed. Safe to run on every deploy.
//   - permission catalogue (upsert by key)
//   - system roles with their default bundles (a role's permissions are only set when the role is CREATED, so an
//     administrator's later edits are never overwritten; the System Administrator always gets the full catalogue)
//   - the first administrator, from SEED_ADMIN_* (created only when that email does not exist yet)
//   - optional demo data when SEED_DEMO=true (refused in production)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "../src/service/password.service";
import { PERMISSIONS } from "../src/config/permissions";

const prisma = new PrismaClient();


const isProd = process.env.NODE_ENV === "production";

const DESCRIPTIONS: Record<string, string> = {
  "users.view": "View users", "users.create": "Create users", "users.update": "Edit users",
  "users.delete": "Delete users", "users.activate": "Activate users", "users.assign_roles": "Assign roles to users",
  "users.revoke_sessions": "Revoke a user's sessions",
  "roles.view": "View roles", "roles.create": "Create roles", "roles.update": "Edit roles",
  "roles.delete": "Delete roles", "roles.assign_permissions": "Change the permissions of a role",
  "permissions.view": "View the permission catalogue",
  "departments.view": "View departments", "departments.create": "Create departments",
  "departments.update": "Edit departments and assign managers", "departments.manage_members": "Manage department members",
  "categories.view": "View ticket categories", "categories.manage": "Create and edit ticket categories",
  "tickets.create": "Submit service requests", "tickets.view_own": "View own requests",
  "tickets.view_assigned": "View tickets assigned to me", "tickets.view_department": "View tickets of departments I manage",
  "tickets.view_all": "View every ticket", "tickets.update_own": "Edit, answer and cancel own requests",
  "tickets.update_assigned": "Edit tickets assigned to me", "tickets.assign": "Assign and reassign tickets",
  "tickets.change_priority": "Change ticket priority", "tickets.change_status": "Start work on a ticket",
  "tickets.accept": "Accept requests into the department queue", "tickets.reject": "Reject requests",
  "tickets.request_clarification": "Ask the requester for more information", "tickets.resolve": "Resolve tickets",
  "tickets.close": "Close resolved tickets", "tickets.reopen": "Reopen resolved or closed tickets",
  "tickets.transfer_department": "Transfer a ticket to another department", "tickets.delete": "Delete tickets and comments",
  "tickets.comment": "Comment on tickets", "tickets.view_work_notes": "Read and write internal work notes",
  "reports.view": "View reports", "reports.export": "Export reports",
  "audit_logs.view": "View the audit log",
  "settings.view": "View application settings", "settings.update": "Change application settings",
};

const BUNDLES: Record<string, { description: string; permissions: readonly string[] }> = {
  "System Administrator": { description: "Full access to everything", permissions: PERMISSIONS },
  "Support Manager": {
    description: "Reviews and routes the queue of a department",
    permissions: [
      "tickets.view_department", "tickets.accept", "tickets.reject", "tickets.request_clarification", "tickets.assign",
      "tickets.change_priority", "tickets.change_status", "tickets.transfer_department", "tickets.comment",
      "tickets.view_work_notes", "tickets.close", "tickets.reopen", "reports.view", "categories.view",
      "categories.manage", "departments.view",
    ],
  },
  "Support Agent": {
    description: "Works the tickets assigned to them",
    permissions: [
      "tickets.view_assigned", "tickets.update_assigned", "tickets.change_status", "tickets.resolve",
      "tickets.comment", "tickets.view_work_notes", "categories.view", "departments.view",
    ],
  },
  Employee: {
    description: "Submits and follows their own requests",
    permissions: [
      "tickets.create", "tickets.view_own", "tickets.update_own", "tickets.comment", "tickets.reopen",
      "categories.view", "departments.view",
    ],
  },
  "Auditor (read-only)": {
    description: "Read-only visibility across the platform",
    permissions: ["tickets.view_all", "reports.view", "audit_logs.view", "departments.view", "categories.view"],
  },
};

async function seedCatalogue() {
  for (const key of PERMISSIONS) {
    const module = key.split(".")[0]!;
    const description = DESCRIPTIONS[key] ?? key;
    await prisma.permission.upsert({ where: { key }, create: { key, module, description }, update: { module, description } });
  }
  const perms = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idOf = new Map(perms.map((p) => [p.key, p.id]));

  for (const [name, bundle] of Object.entries(BUNDLES)) {
    const existing = await prisma.role.findUnique({ where: { name }, select: { id: true } });
    if (!existing) {
      await prisma.role.create({
        data: {
          name, description: bundle.description, isSystem: true, isActive: true,
          rolePermissions: { create: bundle.permissions.map((k) => ({ permissionId: idOf.get(k)! })) },
        },
      });
      console.log(`created role ${name}`);
    } else if (name === "System Administrator") {
      // New catalogue keys must reach the administrator automatically.
      await prisma.rolePermission.createMany({
        data: PERMISSIONS.map((k) => ({ roleId: existing.id, permissionId: idOf.get(k)! })),
        skipDuplicates: true,
      });
    }
  }
}

async function ensureUser(input: {
  email: string; firstName: string; lastName: string; password: string; role: string;
  departmentCode?: string; jobTitle?: string; mustChangePassword?: boolean;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return existing.id;
  const [role, dept] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: input.role }, select: { id: true } }),
    input.departmentCode ? prisma.department.findUnique({ where: { code: input.departmentCode }, select: { id: true } }) : null,
  ]);
  const user = await prisma.user.create({
    data: {
      email, firstName: input.firstName, lastName: input.lastName, jobTitle: input.jobTitle ?? null,
      passwordHash: await hash(input.password),
      status: "ACTIVE", // the schema default is INACTIVE
      mustChangePassword: input.mustChangePassword ?? false,
      departmentId: dept?.id ?? null,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
  console.log(`created user ${email} (${input.role})`);
  return user.id;
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping administrator");
    return;
  }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters with lower case, upper case and a digit");
  }
  await ensureUser({
    email, password, role: "System Administrator", mustChangePassword: isProd,
    firstName: process.env.SEED_ADMIN_FIRST_NAME ?? "System", lastName: process.env.SEED_ADMIN_LAST_NAME ?? "Administrator",
  });
}

async function seedDemo() {
  if (isProd) throw new Error("SEED_DEMO=true is refused when NODE_ENV=production");
  const password = process.env.SEED_DEMO_PASSWORD ?? "Workdesk#Demo1";

  const departments = [
    { code: "IT", name: "IT Support", description: "Hardware, software and access" },
    { code: "HR", name: "Human Resources", description: "People and payroll questions" },
    { code: "FIN", name: "Finance", description: "Expenses and procurement" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({ where: { code: d.code }, create: d, update: {} });
  }
  const categories: [string, string, boolean][] = [
    ["IT", "Laptop request", false], ["IT", "Software access", false], ["IT", "Network issue", false],
    ["HR", "Leave question", false], ["HR", "Payroll query", true],
    ["FIN", "Expense claim", false], ["FIN", "Purchase request", false],
  ];
  for (const [code, name, isSensitive] of categories) {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code }, select: { id: true } });
    await prisma.ticketCategory.upsert({
      where: { departmentId_name: { departmentId: dept.id, name } }, create: { departmentId: dept.id, name, isSensitive }, update: {},
    });
  }

  const people = [
    { email: "manager.it@workdesk.local", firstName: "Maya", lastName: "Mensah", role: "Support Manager", departmentCode: "IT" },
    { email: "agent.it@workdesk.local", firstName: "Kofi", lastName: "Boateng", role: "Support Agent", departmentCode: "IT" },
    { email: "agent2.it@workdesk.local", firstName: "Ama", lastName: "Owusu", role: "Support Agent", departmentCode: "IT" },
    { email: "manager.hr@workdesk.local", firstName: "Esi", lastName: "Quaye", role: "Support Manager", departmentCode: "HR" },
    { email: "agent.hr@workdesk.local", firstName: "Yaw", lastName: "Darko", role: "Support Agent", departmentCode: "HR" },
    { email: "employee@workdesk.local", firstName: "Efua", lastName: "Annan", role: "Employee", departmentCode: "FIN" },
    { email: "employee2@workdesk.local", firstName: "Kwame", lastName: "Asare", role: "Employee", departmentCode: "FIN" },
    { email: "auditor@workdesk.local", firstName: "Abena", lastName: "Sarpong", role: "Auditor (read-only)" },
  ];
  const ids = new Map<string, string>();
  for (const p of people) ids.set(p.email, await ensureUser({ ...p, password }));

  const link = async (deptCode: string, managerEmail: string, agentEmails: string[]) => {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: deptCode }, select: { id: true } });
    await prisma.departmentManager.createMany({ data: [{ departmentId: dept.id, userId: ids.get(managerEmail)! }], skipDuplicates: true });
    await prisma.departmentMember.createMany({
      data: agentEmails.map((e) => ({ departmentId: dept.id, userId: ids.get(e)! })), skipDuplicates: true,
    });
  };
  await link("IT", "manager.it@workdesk.local", ["agent.it@workdesk.local", "agent2.it@workdesk.local"]);
  await link("HR", "manager.hr@workdesk.local", ["agent.hr@workdesk.local"]);
  console.log(`demo data ready (password for demo users: ${password})`);
}

async function main() {
  await seedCatalogue();
  await seedAdmin();
  if (process.env.SEED_DEMO === "true") await seedDemo();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
