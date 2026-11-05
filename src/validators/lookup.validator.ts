import { z } from "zod";
import { uuid } from "@/validators/common";

export const lookupCategoriesQuery = z.object({ departmentId: uuid });
export const lookupAgentsQuery = z.object({ departmentId: uuid });
export const lookupUsersQuery = z.object({
  search: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
