import { prisma } from "@/config/prisma";

/** Append a login_attempts row. No FK to users, so unknown-email attempts are recorded too. */
export async function record(input: {
  email: string;
  ip: string | null;
  success: boolean;
  failureReason?: string;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: input.email.slice(0, 255),
      ipAddress: input.ip?.slice(0, 45) ?? null,
      success: input.success,
      failureReason: input.failureReason?.slice(0, 50) ?? null,
    },
  });
}
