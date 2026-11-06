// Business-rule errors named in docs/API_ROUTES.md that are not in the generic Errors table.
import { Prisma } from "@prisma/client";
import { ApiError, Errors } from "@/utilities/api-error";

export const DomainErrors = {
  lastAdminProtected: (message = "This change would leave the system without an active administrator") =>
    new ApiError(409, message, undefined, "LAST_ADMIN_PROTECTED"),
  roleInUse: (message = "Role is a system role or is still assigned to users") =>
    new ApiError(409, message, undefined, "ROLE_IN_USE"),
  hasOpenAssignments: (message = "User still has open assigned tickets") =>
    new ApiError(409, message, undefined, "HAS_OPEN_ASSIGNMENTS"),
  departmentNeedsManager: (message = "A department must keep at least one manager") =>
    new ApiError(409, message, undefined, "DEPARTMENT_NEEDS_MANAGER"),
  limitExceeded: (message: string) => new ApiError(422, message, undefined, "LIMIT_EXCEEDED"),
  unprocessable: (message: string, code = "UNPROCESSABLE") => new ApiError(422, message, undefined, code),
  invalidStateTransition: (message: string, details?: unknown) =>
    new ApiError(409, message, details, "INVALID_STATE_TRANSITION"),
  agentNotEligible: (message = "That agent cannot be assigned to this ticket") =>
    new ApiError(422, message, undefined, "AGENT_NOT_ELIGIBLE"),
};

/** Run `fn`; a unique-constraint violation (P2002) becomes 409 CONFLICT with a readable message. */
export async function conflictOnUnique<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict(message);
    throw e;
  }
}
