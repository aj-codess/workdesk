// Response shapes from docs/API_ROUTES.md section 2. Models return these; the model layer
// is also where passwordHash, token hashes and failedLoginCount must be dropped.
import type { AuthContext } from "@/types/auth";

export type { AuthContext };

export type UserStatus = "ACTIVE" | "INACTIVE";
export type TicketStatus =
  | "PENDING_REVIEW" | "CLARIFICATION_REQUESTED" | "ACCEPTED" | "REJECTED" | "ASSIGNED"
  | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CommentKind = "COMMENT" | "WORK_NOTE" | "CLARIFICATION";
export type SessionRevokeReason =
  | "LOGOUT" | "LOGOUT_ALL" | "USER_DEACTIVATED" | "PASSWORD_CHANGED" | "PASSWORD_RESET"
  | "REFRESH_REUSE_DETECTED" | "ADMIN_REVOKED";
export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILURE";

export interface UserRef { id: string; firstName: string; lastName: string; email: string }
export interface NameRef { id: string; name: string }
export interface DepartmentRef { id: string; name: string; code: string }

export interface UserSummary {
  id: string; email: string; firstName: string; lastName: string; status: UserStatus;
  department: DepartmentRef | null; roles: NameRef[]; lastLoginAt: string | null; createdAt: string;
}
export interface UserDetail extends UserSummary {
  phone: string | null; jobTitle: string | null; avatarUrl: string | null;
  mustChangePassword: boolean; deactivatedAt: string | null; updatedAt: string;
  managedDepartments: NameRef[]; memberDepartments: NameRef[];
}
export interface AuthUser extends Omit<UserDetail, "lastLoginAt" | "deactivatedAt"> {
  managedDepartmentIds: string[]; memberDepartmentIds: string[];
}

/** Internal only: never leaves the API. */
export interface UserCredentials {
  id: string; email: string; firstName: string; passwordHash: string; status: UserStatus;
  lockedUntil: Date | null; failedLoginCount: number; deletedAt: Date | null;
}

export interface Permission { id: string; key: string; module: string; description: string }
export interface Role {
  id: string; name: string; description: string | null; isActive: boolean; isSystem: boolean;
  permissionCount: number; userCount: number; createdAt: string; updatedAt: string;
}
export interface RoleDetail extends Role { permissions: Permission[] }

export interface Department {
  id: string; name: string; code: string; description: string | null; isActive: boolean;
  managerCount: number; memberCount: number; createdAt: string;
}
export interface DepartmentDetail extends Department { managers: UserRef[] }
export interface DepartmentMemberRow { user: UserRef; addedAt: string; openTickets: number }

export interface Category {
  id: string; departmentId: string; name: string; description: string | null;
  isActive: boolean; isSensitive: boolean;
}

export interface TicketSummary {
  id: string; number: number; reference: string; title: string;
  status: TicketStatus; priority: TicketPriority;
  category: { id: string; name: string };
  department: DepartmentRef;
  requester: { id: string; firstName: string; lastName: string };
  assignedAgent: UserRef | null; createdAt: string; updatedAt: string;
}
export type TicketAction =
  | "edit" | "change_priority" | "accept" | "reject" | "request_clarification"
  | "provide_clarification" | "assign" | "reassign" | "start" | "resolve" | "close" | "reopen"
  | "cancel" | "transfer" | "comment" | "add_work_note" | "delete";
export interface TicketDetail extends Omit<TicketSummary, "requester"> {
  description: string;
  requester: {
    id: string; firstName: string; lastName: string;
    // staff scope only
    email?: string; department?: NameRef | null; roles?: string[];
  };
  reviewedBy: UserRef | null; reviewedAt: string | null; rejectionReason: string | null;
  resolution: string | null; resolvedBy: UserRef | null; resolvedAt: string | null;
  closedAt: string | null; reopenCount: number; allowedActions: TicketAction[];
}
export interface TicketTransferResult {
  id: string; number: number; reference: string; status: TicketStatus; departmentId: string;
}
/** Minimum a controller needs after the scope check passed. */
export interface TicketAccessRef {
  id: string; requesterId: string; status: TicketStatus; departmentId: string; staffScope: boolean;
}

export interface Comment {
  id: string; kind: CommentKind; body: string;
  author: { id: string; firstName: string; lastName: string };
  createdAt: string; editedAt: string | null;
}
export interface Activity {
  id: string; action: string; fromStatus: TicketStatus | null; toStatus: TicketStatus | null;
  actor: UserRef | null; metadata: Record<string, unknown>; createdAt: string;
}
export interface Assignment {
  id: string; agent: UserRef; assignedBy: UserRef; assignedAt: string;
  unassignedAt: string | null; reason: string | null;
}
export interface Attachment {
  id: string; fileName: string; mimeType: string; sizeBytes: number; uploadedBy: UserRef;
  commentId: string | null; createdAt: string;
}
/** Internal: includes storageKey, never serialised to clients. */
export interface AttachmentRecord extends Attachment { storageKey: string; uploadedById: string }

export interface Session {
  id: string; userAgent: string | null; ipAddress: string | null; createdAt: string;
  lastUsedAt: string; expiresAt: string; current: boolean;
}
export interface AuditLog {
  id: string; actor: UserRef | null; action: string; entityType: string | null;
  entityId: string | null; outcome: AuditOutcome; before: unknown | null; after: unknown | null;
  ipAddress: string | null; userAgent: string | null; requestId: string | null; createdAt: string;
}
export interface Setting {
  key: string; value: unknown; description: string | null; updatedAt: string; updatedBy: UserRef | null;
}

/** Input for AuditLogModel.record. */
export interface AuditEntry {
  actorId?: string | null; action: string; entityType?: string | null; entityId?: string | null;
  outcome?: AuditOutcome; before?: unknown; after?: unknown;
  ip?: string | null; userAgent?: string | null;
}
