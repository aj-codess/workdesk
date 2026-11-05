import { z } from "zod";
import { atLeastOne, boolQuery, pageQuery, searchQuery, uuid } from "@/validators/common";

export const listCategoriesQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  departmentId: uuid.optional(),
  isActive: boolQuery.optional(),
  search: searchQuery.optional(),
});

export const createCategoryBody = z
  .object({
    departmentId: uuid,
    name: z.string().trim().min(2).max(120),
    description: z.string().max(500).optional(),
    isSensitive: z.boolean().default(false),
  })
  .strict();

export const updateCategoryBody = atLeastOne({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;
