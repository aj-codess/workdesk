import { z } from "zod";
import { csvList, isoDate, uuid } from "@/validators/common";
import { ticketPriority, ticketStatus } from "@/validators/ticket.validator";

const period = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  departmentId: uuid.optional(),
};

export const summaryQuery = z.object(period);

export const ticketsReportQuery = z.object({
  ...period,
  groupBy: z.enum(["status", "priority", "department", "category", "agent", "day", "week", "month"]),
  status: csvList(ticketStatus).optional(),
  priority: csvList(ticketPriority).optional(),
});

export const teamPerformanceQuery = z.object(period);

export const exportQuery = z.object({
  type: z.enum(["tickets", "team-performance"]),
  format: z.literal("csv"),
  ...period,
  groupBy: ticketsReportQuery.shape.groupBy.optional(),
  status: csvList(ticketStatus).optional(),
  priority: csvList(ticketPriority).optional(),
});

export type SummaryQuery = z.infer<typeof summaryQuery>;
export type TicketsReportQuery = z.infer<typeof ticketsReportQuery>;
export type TeamPerformanceQuery = z.infer<typeof teamPerformanceQuery>;
export type ExportQuery = z.infer<typeof exportQuery>;
