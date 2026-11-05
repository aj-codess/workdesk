import { z } from "zod";
import { atLeastOne, boolQuery, pageQuery, searchQuery, uuid } from "@/validators/common";

const uniqueIds = (max: number) =>
  z.array(uuid).max(max).refine((a) => new Set(a).size === a.length, { message: "ids must be unique" });

export const listRolesQuery = z.object({
  ...pageQuery,
  search: searchQuery.optional(),
  isActive: boolQuery.optional(),
  sort: z.enum(["name", "createdAt", "userCount"]).default("name"),
});

export const createRoleBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
    permissionIds: uniqueIds(200).optional(),
  })
  .strict();

export const updateRoleBody = atLeastOne({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const replaceRolePermissionsBody = z.object({ permissionIds: uniqueIds(200) }).strict();

export const listPermissionsQuery = z.object({
  module: z.string().max(50).optional(),
  grouped: boolQuery.default("false"),
});

export type ListRolesQuery = z.infer<typeof listRolesQuery>;
export type CreateRoleBody = z.infer<typeof createRoleBody>;
export type UpdateRoleBody = z.infer<typeof updateRoleBody>;
export type ListPermissionsQuery = z.infer<typeof listPermissionsQuery>;
