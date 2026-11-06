import { prisma } from "@/config/prisma";
import type { Assignment } from "@/types/dto";
import { iso, isoOrNull, toUserRef, userRefSelect } from "@/utilities/mappers";

/** Newest first. */
export async function listForTicket(ticketId: string): Promise<Assignment[]> {
  const rows = await prisma.ticketAssignment.findMany({
    where: { ticketId },
    include: { agent: { select: userRefSelect }, assignedBy: { select: userRefSelect } },
    orderBy: [{ assignedAt: "desc" }, { id: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id, agent: toUserRef(r.agent), assignedBy: toUserRef(r.assignedBy),
    assignedAt: iso(r.assignedAt), unassignedAt: isoOrNull(r.unassignedAt), reason: r.reason,
  }));
}
