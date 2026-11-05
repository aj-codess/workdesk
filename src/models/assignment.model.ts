import type { Assignment } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

/** Newest first. */
export async function listForTicket(_ticketId: string): Promise<Assignment[]> {
  return notImplemented("AssignmentModel.listForTicket");
}
