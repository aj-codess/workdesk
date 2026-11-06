import { prisma } from "@/config/prisma";
import { Errors } from "@/utilities/api-error";

export interface ValidResetToken {
  id: string;
  userId: string;
}

/** Stores the new token and invalidates the user's earlier unused ones, so at most one link is live at a time. */
export async function create(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  requestedIp: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: input.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        requestedIp: input.requestedIp?.slice(0, 45) ?? null,
      },
    }),
  ]);
}

/** Token exists, not used, not expired, user ACTIVE. null otherwise. */
export async function findValidByHash(tokenHash: string): Promise<ValidResetToken | null> {
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true, userId: true },
  });
  return row;
}

/** One transaction: mark the token used, set the new password hash, clear lockedUntil + failedLoginCount. */
export async function consume(input: { tokenId: string; userId: string; passwordHash: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Conditional update = single-use even under concurrent requests.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: input.tokenId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw Errors.validation("Invalid or expired reset token");
    await tx.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: input.passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  });
}
