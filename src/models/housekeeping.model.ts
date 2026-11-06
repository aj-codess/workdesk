// Retention clean-up of rows that are only useful while they can still be used. audit_logs is NEVER purged here.
import { prisma } from "@/config/prisma";

const DAY_MS = 86_400_000;

export interface HousekeepingResult {
  refreshTokens: number;
  sessions: number;
  passwordResetTokens: number;
  loginAttempts: number;
}

export async function purgeExpired(now = new Date()): Promise<HousekeepingResult> {
  const day = new Date(now.getTime() - DAY_MS);
  const month = new Date(now.getTime() - 30 * DAY_MS);

  // Sessions first: their refresh tokens go with them (ON DELETE CASCADE).
  const sessions = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: month } }, { revokedAt: { lt: month } }] },
  });
  const refreshTokens = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: day } } });
  const passwordResetTokens = await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: day } }, { usedAt: { lt: day } }] },
  });
  const loginAttempts = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: month } } });

  return {
    refreshTokens: refreshTokens.count, sessions: sessions.count,
    passwordResetTokens: passwordResetTokens.count, loginAttempts: loginAttempts.count,
  };
}
