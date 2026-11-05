import { z } from "zod";
import { emailSchema, passwordSchema, atLeastOne } from "@/validators/common";

export const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();

export const changePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict()
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "New password must differ from the current password",
    path: ["newPassword"],
  });

export const forgotPasswordBody = z.object({ email: emailSchema }).strict();

export const resetPasswordBody = z
  .object({ token: z.string().regex(/^[0-9a-f]{64}$/i, "invalid token"), newPassword: passwordSchema })
  .strict();

export const sessionParams = z.object({ sessionId: z.string().uuid() });

export const updateProfileBody = atLeastOne({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type LoginBody = z.infer<typeof loginBody>;
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;
