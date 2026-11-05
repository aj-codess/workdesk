import { z } from "zod";
import { atLeastOne, emailSchema, pageQuery, passwordSchema, searchQuery, uuid } from "@/validators/common";

export const listUsersQuery = z.object({
  ...pageQuery,
  search: searchQuery.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  roleId: uuid.optional(),
  departmentId: uuid.optional(),
  sort: z.enum(["createdAt", "firstName", "lastName", "email", "lastLoginAt"]).default("createdAt"),
});

export const createUserBody = z
  .object({
    email: emailSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password: passwordSchema.optional(),
    phone: z.string().max(30).optional(),
    jobTitle: z.string().max(120).optional(),
    departmentId: uuid.optional(),
    roleIds: z.array(uuid).max(20).optional(),
    activate: z.boolean().default(false),
    mustChangePassword: z.boolean().default(true),
  })
  .strict();

export const updateUserBody = atLeastOne({
  email: emailSchema.optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  departmentId: uuid.nullable().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const deactivateUserBody = z.object({ reason: z.string().max(500).optional() }).strict();

export const assignRolesBody = z
  .object({ roleIds: z.array(uuid).max(20) })
  .strict()
  .refine((v) => new Set(v.roleIds).size === v.roleIds.length, { message: "roleIds must be unique", path: ["roleIds"] });

export const adminResetPasswordBody = z.object({ newPassword: passwordSchema.optional() }).strict();

export const roleUsersQuery = z.object({ ...pageQuery, search: searchQuery.optional() });

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
export type RoleUsersQuery = z.infer<typeof roleUsersQuery>;
