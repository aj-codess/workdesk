import { z } from "zod";

export const uuid = z.string().uuid();

export const idParams = z.object({ id: uuid });

/** `true` / `false` query-string booleans. */
export const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");

/** Comma list in a query string, each item validated by `item`: "A,B" -> ["A","B"]. */
export const csvList = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(item));

export const isoDate = z.coerce.date();

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
};

export const searchQuery = z.string().trim().min(1).max(200);

/** Password policy: 8-128 chars, at least one lowercase, one uppercase and one digit. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "must contain a lowercase letter")
  .regex(/[A-Z]/, "must contain an uppercase letter")
  .regex(/\d/, "must contain a digit");

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

/** Build a schema that requires at least one key to be present (PATCH bodies). */
export const atLeastOne = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: "At least one field is required",
    });
