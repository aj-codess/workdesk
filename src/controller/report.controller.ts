import { success } from "@/utilities/api-response";
import { parseQuery } from "@/utilities/request";
import * as ReportModel from "@/models/report.model";
import * as AuditLogModel from "@/models/audit-log.model";
import * as CsvService from "@/service/csv.service";
import { exportQuery, summaryQuery, teamPerformanceQuery, ticketsReportQuery } from "@/validators/report.validator";
import type { ProtectedContext } from "@/types/auth";


/** GET /reports/summary */
export async function summary({ req, auth }: ProtectedContext) {
  return success(await ReportModel.summary(parseQuery(req, summaryQuery), auth));
}

/** GET /reports/tickets */
export async function tickets({ req, auth }: ProtectedContext) {
  return success(await ReportModel.tickets(parseQuery(req, ticketsReportQuery), auth));
}

/** GET /reports/team-performance */
export async function teamPerformance({ req, auth }: ProtectedContext) {
  return success(await ReportModel.teamPerformance(parseQuery(req, teamPerformanceQuery), auth));
}

/** GET /reports/export : text/csv attachment. */
export async function exportCsv({ req, auth }: ProtectedContext) {
  const query = parseQuery(req, exportQuery);
  const rows = await ReportModel.exportRows(query, auth);

  const columns = rows.length
    ? Object.keys(rows[0]).map((key) => ({ header: key, value: (row: Record<string, unknown>) => row[key] }))
    : [];
  const csv = CsvService.toCsv(columns, rows);

  await AuditLogModel.record({
    actorId: auth.userId, action: "reports.exported", entityType: "report", entityId: query.type,
    after: { type: query.type, format: query.format, rows: rows.length }, ip: auth.ip, userAgent: auth.userAgent,
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workdesk-${query.type}-${date}.csv"`,
    },
  });
}
