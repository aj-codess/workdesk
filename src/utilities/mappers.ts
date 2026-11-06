// Small shared helpers for the model layer: Prisma rows -> response DTO pieces.
import type { Prisma } from "@prisma/client";
import type { DepartmentRef, NameRef, UserRef } from "@/types/dto";

/** Prisma client or an interactive-transaction client: models accept either so audit rows join the caller's transaction. */
export type Db = Prisma.TransactionClient;

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const userRefSelect = { id: true, firstName: true, lastName: true, email: true } as const;
export const deptRefSelect = { id: true, name: true, code: true } as const;

export const toUserRef = (u: { id: string; firstName: string; lastName: string; email: string }): UserRef => ({
  id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
});
export const toNameRef = (r: { id: string; name: string }): NameRef => ({ id: r.id, name: r.name });
export const toDeptRef = (d: { id: string; name: string; code: string }): DepartmentRef => ({
  id: d.id, name: d.name, code: d.code,
});

/** Escape LIKE wildcards so user search text is matched literally. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Human ticket reference: WD-<year>-<number padded to 6>. Derived, never stored. */
export const ticketReference = (number: number, createdAt: Date): string =>
  `WD-${createdAt.getUTCFullYear()}-${String(number).padStart(6, "0")}`;
