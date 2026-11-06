import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { Activity } from "@/types/dto";
import type { ListActivityQuery } from "@/validators/ticket.validator";
import { iso, toUserRef, userRefSelect } from "@/utilities/mappers";

type Meta = Record<string, unknown>;

/**
 * What a requester-only viewer may see in an activity row. Internal reasons, notes, agent ids and previous
 * resolutions stay staff-only; the business-visible facts (rejection reason, own edits, comment ids) remain.
 */
function publicMetadata(action: string, m: Meta): Meta {
  switch (action) {
    case "REJECTED": return { reason: m.reason ?? null };
    case "UPDATED": return { changes: m.changes ?? {} };
    case "COMMENTED":
    case "CLARIFICATION_REQUESTED":
    case "CLARIFICATION_PROVIDED": return { commentId: m.commentId ?? null };
    case "RESOLVED": return { resolution: m.resolution ?? null };
    case "REOPENED": return { reason: m.reason ?? null };
    case "CANCELLED": return { reason: m.reason ?? null };
    default: return {};
  }
}

/** Newest first. Withhold WORK_NOTE-related metadata when `staffScope` is false (requester-only viewers). */
export async function listForTicket(
  ticketId: string,
  query: ListActivityQuery,
  opts: { staffScope: boolean }
): Promise<Paginated<Activity>> {
  const where: Prisma.TicketActivityWhereInput = {
    ticketId,
    // A work note's existence is itself internal.
    ...(opts.staffScope ? {} : { NOT: { action: "COMMENTED", metadata: { path: ["kind"], equals: "WORK_NOTE" } } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.ticketActivity.findMany({
      where, include: { actor: { select: userRefSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.ticketActivity.count({ where }),
  ]);
  return {
    rows: rows.map((r) => {
      const meta = (r.metadata ?? {}) as Meta;
      return {
        id: r.id, action: r.action, fromStatus: r.fromStatus, toStatus: r.toStatus,
        actor: r.actor ? toUserRef(r.actor) : null,
        metadata: opts.staffScope ? meta : publicMetadata(r.action, meta),
        createdAt: iso(r.createdAt),
      };
    }),
    total,
  };
}
