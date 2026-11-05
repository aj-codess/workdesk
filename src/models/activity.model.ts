import type { Paginated } from "@/types/pagination";
import type { Activity } from "@/types/dto";
import type { ListActivityQuery } from "@/validators/ticket.validator";
import { notImplemented } from "@/utilities/not-implemented";

/** Newest first. Withhold WORK_NOTE-related metadata when `staffScope` is false (requester-only viewers). */
export async function listForTicket(
  _ticketId: string,
  _query: ListActivityQuery,
  _opts: { staffScope: boolean }
): Promise<Paginated<Activity>> {
  return notImplemented("ActivityModel.listForTicket");
}
