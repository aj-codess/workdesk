// Ticket comments. Callers have already been scope-checked via TicketModel.findAccessRef.
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Comment } from "@/types/dto";
import type { CreateCommentBody, ListCommentsQuery } from "@/validators/ticket.validator";
import { notImplemented } from "@/utilities/not-implemented";

/** Oldest first. WORK_NOTE rows only when `includeWorkNotes` (tickets.view_work_notes AND staff scope). Excludes soft-deleted. */
export async function list(
  _ticketId: string,
  _query: ListCommentsQuery,
  _opts: { includeWorkNotes: boolean }
): Promise<Paginated<Comment>> {
  return notImplemented("CommentModel.list");
}

/** Blocked on CANCELLED / REJECTED / CLOSED tickets (409 INVALID_STATE_TRANSITION). Activity COMMENTED. */
export async function create(_ticketId: string, _input: CreateCommentBody, _auth: AuthContext): Promise<Comment> {
  return notImplemented("CommentModel.create");
}

/** Author only; not allowed on CLARIFICATION comments. Sets editedAt. null when not found / not the author. */
export async function update(_ticketId: string, _commentId: string, _body: string, _auth: AuthContext): Promise<Comment | null> {
  return notImplemented("CommentModel.update");
}

/** Soft delete. Allowed for the author, or anyone when `canDeleteAny` (holds tickets.delete). false when not found / not allowed. */
export async function softDelete(
  _ticketId: string,
  _commentId: string,
  _auth: AuthContext,
  _opts: { canDeleteAny: boolean }
): Promise<boolean> {
  return notImplemented("CommentModel.softDelete");
}
