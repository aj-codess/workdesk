import { z } from "zod";
import { atLeastOne, csvList, isoDate, pageQuery, searchQuery, uuid } from "@/validators/common";

export const ticketStatus = z.enum([
  "PENDING_REVIEW", "CLARIFICATION_REQUESTED", "ACCEPTED", "REJECTED", "ASSIGNED",
  "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
]);
export const ticketPriority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const listTicketsQuery = z.object({
  ...pageQuery,
  search: searchQuery.optional(),
  status: csvList(ticketStatus).optional(),
  priority: csvList(ticketPriority).optional(),
  categoryId: uuid.optional(),
  departmentId: uuid.optional(),
  requesterId: uuid.optional(),
  assignedAgentId: z.union([uuid, z.enum(["me", "none"])]).optional(),
  view: z.enum(["mine", "assigned", "department", "all"]).optional(),
  createdFrom: isoDate.optional(),
  createdTo: isoDate.optional(),
  sort: z.enum(["createdAt", "updatedAt", "priority", "status", "number"]).default("createdAt"),
});

export const createTicketBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(10000),
    departmentId: uuid,
    categoryId: uuid,
    priority: ticketPriority.default("MEDIUM"),
  })
  .strict();

export const updateTicketBody = atLeastOne({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(10).max(10000).optional(),
  categoryId: uuid.optional(),
});

export const changePriorityBody = z.object({ priority: ticketPriority, reason: z.string().max(500).optional() }).strict();

export const acceptBody = z.object({ note: z.string().max(1000).optional() }).strict();
export const rejectBody = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export const requestClarificationBody = z.object({ question: z.string().trim().min(5).max(2000) }).strict();
export const provideClarificationBody = z
  .object({ response: z.string().trim().min(5).max(5000), description: z.string().trim().min(10).max(10000).optional() })
  .strict();
export const assignBody = z
  .object({ agentId: uuid, reason: z.string().trim().min(5).max(500).optional(), note: z.string().max(1000).optional() })
  .strict();
export const changeStatusBody = z.object({ status: z.literal("IN_PROGRESS"), note: z.string().max(1000).optional() }).strict();
export const resolveBody = z.object({ resolution: z.string().trim().min(10).max(5000) }).strict();
export const closeBody = z.object({ note: z.string().max(1000).optional() }).strict();
export const reopenBody = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export const cancelBody = z.object({ reason: z.string().max(500).optional() }).strict();
export const transferBody = z
  .object({ departmentId: uuid, categoryId: uuid, reason: z.string().trim().min(5).max(500) })
  .strict();

// comments
export const ticketCommentParams = z.object({ id: uuid, commentId: uuid });
export const listCommentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(["COMMENT", "WORK_NOTE", "CLARIFICATION"]).optional(),
});
export const createCommentBody = z
  .object({ body: z.string().trim().min(1).max(5000), kind: z.enum(["COMMENT", "WORK_NOTE"]).default("COMMENT") })
  .strict();
export const updateCommentBody = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

// activity
export const listActivityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// attachments
export const ticketAttachmentParams = z.object({ id: uuid, attachmentId: uuid });
export const uploadAttachmentFields = z.object({ commentId: uuid.optional() });

export type ListTicketsQuery = z.infer<typeof listTicketsQuery>;
export type CreateTicketBody = z.infer<typeof createTicketBody>;
export type UpdateTicketBody = z.infer<typeof updateTicketBody>;
export type ChangePriorityBody = z.infer<typeof changePriorityBody>;
export type AcceptBody = z.infer<typeof acceptBody>;
export type RejectBody = z.infer<typeof rejectBody>;
export type RequestClarificationBody = z.infer<typeof requestClarificationBody>;
export type ProvideClarificationBody = z.infer<typeof provideClarificationBody>;
export type AssignBody = z.infer<typeof assignBody>;
export type ChangeStatusBody = z.infer<typeof changeStatusBody>;
export type ResolveBody = z.infer<typeof resolveBody>;
export type CloseBody = z.infer<typeof closeBody>;
export type ReopenBody = z.infer<typeof reopenBody>;
export type CancelBody = z.infer<typeof cancelBody>;
export type TransferBody = z.infer<typeof transferBody>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuery>;
export type CreateCommentBody = z.infer<typeof createCommentBody>;
export type ListActivityQuery = z.infer<typeof listActivityQuery>;
