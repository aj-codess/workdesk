import { z } from "zod";
import { atLeastOne, boolQuery, pageQuery, searchQuery, uuid } from "@/validators/common";

const code = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(20)
  .regex(/^[A-Z0-9_-]+$/, "only A-Z, 0-9, _ and -");

export const listDepartmentsQuery = z.object({
  ...pageQuery,
  search: searchQuery.optional(),
  isActive: boolQuery.optional(),
  sort: z.enum(["name", "code", "createdAt"]).default("name"),
});

export const createDepartmentBody = z
  .object({ name: z.string().trim().min(2).max(120), code, description: z.string().max(1000).optional() })
  .strict();

export const updateDepartmentBody = atLeastOne({
  name: z.string().trim().min(2).max(120).optional(),
  code: code.optional(),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const departmentUserParams = z.object({ id: uuid, userId: uuid });

export const addManagerBody = z.object({ userId: uuid }).strict();

export const addMembersBody = z
  .object({ userIds: z.array(uuid).min(1).max(50) })
  .strict()
  .refine((v) => new Set(v.userIds).size === v.userIds.length, { message: "userIds must be unique", path: ["userIds"] });

export const listMembersQuery = z.object({ ...pageQuery, search: searchQuery.optional() });

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuery>;
export type CreateDepartmentBody = z.infer<typeof createDepartmentBody>;
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBody>;
export type ListMembersQuery = z.infer<typeof listMembersQuery>;
