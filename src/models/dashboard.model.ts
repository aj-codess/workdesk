// Dashboard aggregates. "Open" = any status except RESOLVED, CLOSED, REJECTED, CANCELLED.
// recentlyUpdated = the 5 latest tickets by updatedAt.
import type { AuthContext } from "@/types/auth";
import type { TicketSummary, UserRef } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

export interface MyRequestsDashboard {
  total: number; open: number; pending: number; inProgress: number; resolved: number;
  byStatus: Record<string, number>; recentlyUpdated: TicketSummary[];
}
export interface MyWorkDashboard {
  assigned: number; open: number; inProgress: number; resolvedLast30Days: number; recentlyUpdated: TicketSummary[];
}
export interface DepartmentDashboard {
  departments: {
    department: { id: string; name: string };
    totalRequests: number; pendingReview: number; clarificationRequested: number;
    unassignedAccepted: number; awaitingResolution: number;
    byAgent: { agent: UserRef; open: number; resolved: number }[];
    /** null when fewer than 5 resolved tickets */
    avgResolutionHours: number | null; resolvedSampleSize: number;
  }[];
}
export interface SystemDashboard {
  tickets: { total: number; open: number; resolved: number; byStatus: Record<string, number>; byPriority: Record<string, number> };
  /** Only present when `includeUsers` (caller also holds users.view). */
  users?: { total: number; active: number; supportAgents: number };
}

export async function myRequests(_auth: AuthContext): Promise<MyRequestsDashboard> {
  return notImplemented("DashboardModel.myRequests");
}

export async function myWork(_auth: AuthContext): Promise<MyWorkDashboard> {
  return notImplemented("DashboardModel.myWork");
}

/** departmentId must be one the caller manages (else return null -> 404). Omitted = all managed departments. */
export async function department(_departmentId: string | undefined, _auth: AuthContext): Promise<DepartmentDashboard | null> {
  return notImplemented("DashboardModel.department");
}

export async function system(_opts: { includeUsers: boolean }): Promise<SystemDashboard> {
  return notImplemented("DashboardModel.system");
}
