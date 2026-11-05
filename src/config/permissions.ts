// Permission catalogue keys (docs/architecture.md section 9). The rows are seeded in the
// database; these constants only exist so route files and controllers cannot mistype a key.
export const PERMISSIONS = [
  // users
  "users.view", "users.create", "users.update", "users.delete", "users.activate",
  "users.assign_roles", "users.revoke_sessions",
  // roles
  "roles.view", "roles.create", "roles.update", "roles.delete", "roles.assign_permissions",
  // permissions
  "permissions.view",
  // departments
  "departments.view", "departments.create", "departments.update", "departments.manage_members",
  // categories
  "categories.view", "categories.manage",
  // tickets
  "tickets.create", "tickets.view_own", "tickets.view_assigned", "tickets.view_department",
  "tickets.view_all", "tickets.update_own", "tickets.update_assigned", "tickets.assign",
  "tickets.change_priority", "tickets.change_status", "tickets.accept", "tickets.reject",
  "tickets.request_clarification", "tickets.resolve", "tickets.close", "tickets.reopen",
  "tickets.transfer_department", "tickets.delete", "tickets.comment", "tickets.view_work_notes",
  // reports
  "reports.view", "reports.export",
  // audit
  "audit_logs.view",
  // settings
  "settings.view", "settings.update",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/** Any of these grants some ticket visibility (the "any tickets.view_*" routes). */
export const TICKET_VIEW_PERMISSIONS: PermissionKey[] = [
  "tickets.view_own",
  "tickets.view_assigned",
  "tickets.view_department",
  "tickets.view_all",
];

/** Holding any of these means the caller is staff for ticket purposes, not a requester only. */
export const TICKET_STAFF_VIEW_PERMISSIONS: PermissionKey[] = [
  "tickets.view_assigned",
  "tickets.view_department",
  "tickets.view_all",
];
