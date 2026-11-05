// Reports are computed OVER THE CALLER'S VISIBLE TICKETS (same scope union as TicketModel). Dates default to the last 30 days.
import type { AuthContext } from "@/types/auth";
import type { UserRef } from "@/types/dto";
import type { ExportQuery, SummaryQuery, TeamPerformanceQuery, TicketsReportQuery } from "@/validators/report.validator";
import { notImplemented } from "@/utilities/not-implemented";

export interface ReportSummary {
  period: { from: string; to: string };
  totals: { created: number; resolved: number; closed: number; rejected: number; open: number };
  byStatus: Record<string, number>; byPriority: Record<string, number>;
  avgResolutionHours: number | null; reopenRate: number;
}
export interface TicketsReport { groupBy: string; rows: { key: string; label: string; count: number }[] }
export interface TeamPerformanceRow {
  agent: UserRef; assigned: number; resolved: number; open: number; reopened: number; avgResolutionHours: number | null;
}
export interface TeamPerformanceReport { rows: TeamPerformanceRow[] }

export async function summary(_query: SummaryQuery, _auth: AuthContext): Promise<ReportSummary> {
  return notImplemented("ReportModel.summary");
}

export async function tickets(_query: TicketsReportQuery, _auth: AuthContext): Promise<TicketsReport> {
  return notImplemented("ReportModel.tickets");
}

/** view_all -> all agents; view_department -> agents of managed departments; otherwise only the caller's own row. */
export async function teamPerformance(_query: TeamPerformanceQuery, _auth: AuthContext): Promise<TeamPerformanceReport> {
  return notImplemented("ReportModel.teamPerformance");
}

/** Flat rows for the CSV export, same filters as the matching report. */
export async function exportRows(_query: ExportQuery, _auth: AuthContext): Promise<Record<string, unknown>[]> {
  return notImplemented("ReportModel.exportRows");
}
