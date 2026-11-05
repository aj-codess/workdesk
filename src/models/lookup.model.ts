// Lightweight dropdown data: active records only, minimal fields, capped, no pagination.
import type { AuthContext } from "@/types/auth";
import type { DepartmentRef, UserRef } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

export async function departments(): Promise<DepartmentRef[]> {
  return notImplemented("LookupModel.departments");
}

export async function categories(_departmentId: string): Promise<{ id: string; name: string; isSensitive: boolean }[]> {
  return notImplemented("LookupModel.categories");
}

/** Department must be in the caller's scope (return null -> 404). Active members holding tickets.view_assigned, with open ticket counts. */
export async function agents(
  _departmentId: string,
  _auth: AuthContext
): Promise<(UserRef & { openTickets: number })[] | null> {
  return notImplemented("LookupModel.agents");
}

/** Active roles. `assignable` is false when the role contains a permission the caller does not hold. */
export async function roles(_auth: AuthContext): Promise<{ id: string; name: string; description: string | null; assignable: boolean }[]> {
  return notImplemented("LookupModel.roles");
}

/** Active users matching name or email (ILIKE). */
export async function users(_search: string, _limit: number): Promise<UserRef[]> {
  return notImplemented("LookupModel.users");
}
