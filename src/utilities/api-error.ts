export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    /** Machine-readable code from docs/API_ROUTES.md (e.g. NOT_FOUND, FORBIDDEN). */
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Shorthand constructors for the standard error codes in docs/API_ROUTES.md. */
export const Errors = {
  unauthenticated: (message = "Authentication required") =>
    new ApiError(401, message, undefined, "UNAUTHENTICATED"),
  tokenExpired: () => new ApiError(401, "Access token expired", undefined, "TOKEN_EXPIRED"),
  sessionRevoked: () => new ApiError(401, "Session is no longer valid", undefined, "SESSION_REVOKED"),
  invalidCredentials: () =>
    new ApiError(401, "Invalid email or password", undefined, "INVALID_CREDENTIALS"),
  forbidden: (message = "You do not have permission to perform this action") =>
    new ApiError(403, message, undefined, "FORBIDDEN"),
  privilegeEscalation: (message = "You cannot grant permissions you do not hold") =>
    new ApiError(403, message, undefined, "PRIVILEGE_ESCALATION"),
  notFound: (what = "Resource") => new ApiError(404, `${what} not found`, undefined, "NOT_FOUND"),
  conflict: (message: string) => new ApiError(409, message, undefined, "CONFLICT"),
  cannotModifySelf: (message = "You cannot perform this action on your own account") =>
    new ApiError(409, message, undefined, "CANNOT_MODIFY_SELF"),
  validation: (message: string, details?: unknown) =>
    new ApiError(400, message, details, "VALIDATION_ERROR"),
  invalidCurrentPassword: () =>
    new ApiError(422, "Current password is incorrect", undefined, "INVALID_CURRENT_PASSWORD"),
  tooManyRequests: (retryAfterSeconds?: number) =>
    new ApiError(429, "Too many requests", { retryAfterSeconds }, "TOO_MANY_REQUESTS"),
  notImplemented: (name: string) =>
    new ApiError(501, `Not implemented: ${name}`, undefined, "NOT_IMPLEMENTED"),
};
