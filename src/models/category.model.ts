import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Category } from "@/types/dto";
import type { CreateCategoryBody, ListCategoriesQuery, UpdateCategoryBody } from "@/validators/category.validator";
import { Errors } from "@/utilities/api-error";
import { conflictOnUnique } from "@/utilities/domain-errors";
import type { Db } from "@/utilities/mappers";
import { managesDepartment } from "@/models/scope";
import * as AuditLogModel from "@/models/audit-log.model";

type Row = Prisma.TicketCategoryGetPayload<object>;
const toCategory = (c: Row): Category => ({
  id: c.id, departmentId: c.departmentId, name: c.name, description: c.description,
  isActive: c.isActive, isSensitive: c.isSensitive,
});

async function inScope(db: Db, auth: AuthContext, departmentId: string): Promise<boolean> {
  return auth.permissions.includes("departments.update") || managesDepartment(db, auth.userId, departmentId);
}

export async function list(query: ListCategoriesQuery): Promise<Paginated<Category>> {
  const where: Prisma.TicketCategoryWhereInput = {
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.ticketCategory.findMany({
      where, orderBy: [{ name: query.order === "desc" ? "desc" : "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.ticketCategory.count({ where }),
  ]);
  return { rows: rows.map(toCategory), total };
}

export async function findById(id: string): Promise<Category | null> {
  const row = await prisma.ticketCategory.findUnique({ where: { id } });
  return row ? toCategory(row) : null;
}

/**
 * Department scope: the caller must manage the category's department, unless they hold `departments.update`.
 * Out of scope -> return null (the controller answers 404). Throw 409 CONFLICT (name unique per department).
 */
export async function create(input: CreateCategoryBody, auth: AuthContext): Promise<Category | null> {
  return conflictOnUnique("A category with this name already exists in this department", () =>
    prisma.$transaction(async (tx) => {
      const dept = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
      if (!dept || !(await inScope(tx, auth, input.departmentId))) return null;
      const dup = await tx.ticketCategory.findFirst({
        where: { departmentId: input.departmentId, name: { equals: input.name, mode: "insensitive" } }, select: { id: true },
      });
      if (dup) throw Errors.conflict("A category with this name already exists in this department");
      const row = await tx.ticketCategory.create({
        data: { departmentId: input.departmentId, name: input.name, description: input.description ?? null, isSensitive: input.isSensitive },
      });
      await AuditLogModel.record(
        { actorId: auth.userId, action: "categories.created", entityType: "category", entityId: row.id, after: toCategory(row), ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return toCategory(row);
    })
  );
}

/** Same scope rule as create. departmentId is immutable. */
export async function update(id: string, input: UpdateCategoryBody, auth: AuthContext): Promise<Category | null> {
  return conflictOnUnique("A category with this name already exists in this department", () =>
    prisma.$transaction(async (tx) => {
      const before = await tx.ticketCategory.findUnique({ where: { id } });
      if (!before || !(await inScope(tx, auth, before.departmentId))) return null;
      if (input.name !== undefined) {
        const dup = await tx.ticketCategory.findFirst({
          where: { departmentId: before.departmentId, id: { not: id }, name: { equals: input.name, mode: "insensitive" } }, select: { id: true },
        });
        if (dup) throw Errors.conflict("A category with this name already exists in this department");
      }
      const after = await tx.ticketCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.isSensitive !== undefined ? { isSensitive: input.isSensitive } : {}),
        },
      });
      await AuditLogModel.record(
        { actorId: auth.userId, action: "categories.updated", entityType: "category", entityId: id, before: toCategory(before), after: toCategory(after), ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return toCategory(after);
    })
  );
}
