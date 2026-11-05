import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Department, DepartmentDetail, DepartmentMemberRow, UserRef } from "@/types/dto";
import type {
  CreateDepartmentBody, ListDepartmentsQuery, ListMembersQuery, UpdateDepartmentBody,
} from "@/validators/department.validator";
import { notImplemented } from "@/utilities/not-implemented";

export async function list(_query: ListDepartmentsQuery): Promise<Paginated<Department>> {
  return notImplemented("DepartmentModel.list");
}

export async function findById(_id: string): Promise<DepartmentDetail | null> {
  return notImplemented("DepartmentModel.findById");
}

/** Audit: departments.created. Throw 409 CONFLICT (name or code). */
export async function create(_input: CreateDepartmentBody, _auth: AuthContext): Promise<DepartmentDetail> {
  return notImplemented("DepartmentModel.create");
}

/** Audit: departments.updated with before/after. */
export async function update(_id: string, _input: UpdateDepartmentBody, _auth: AuthContext): Promise<DepartmentDetail | null> {
  return notImplemented("DepartmentModel.update");
}

/** null when the department does not exist. */
export async function listManagers(_departmentId: string): Promise<UserRef[] | null> {
  return notImplemented("DepartmentModel.listManagers");
}

/**
 * Audit: departments.manager_added. 404 (user/department), 409 CONFLICT (already a manager),
 * 422 LIMIT_EXCEEDED (setting department.max_managers), 422 when the user is not ACTIVE.
 * `warnings` lists e.g. "User holds no role granting tickets.view_department".
 */
export async function addManager(
  _departmentId: string,
  _userId: string,
  _auth: AuthContext
): Promise<{ managers: UserRef[]; warnings: string[] }> {
  return notImplemented("DepartmentModel.addManager");
}

/** Audit: departments.manager_removed. 409 DEPARTMENT_NEEDS_MANAGER if last manager and PENDING_REVIEW / CLARIFICATION_REQUESTED tickets exist. false when not a manager. */
export async function removeManager(_departmentId: string, _userId: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("DepartmentModel.removeManager");
}

export async function listMembers(
  _departmentId: string,
  _query: ListMembersQuery
): Promise<Paginated<DepartmentMemberRow> | null> {
  return notImplemented("DepartmentModel.listMembers");
}

/** Audit: departments.members_added. All users must be ACTIVE; existing members are skipped. */
export async function addMembers(
  _departmentId: string,
  _userIds: string[],
  _auth: AuthContext
): Promise<{ added: number; skipped: number }> {
  return notImplemented("DepartmentModel.addMembers");
}

/** Audit: departments.member_removed. 409 HAS_OPEN_ASSIGNMENTS while the user holds ASSIGNED / IN_PROGRESS / REOPENED tickets of this department. false when not a member. */
export async function removeMember(_departmentId: string, _userId: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("DepartmentModel.removeMember");
}
