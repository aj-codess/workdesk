import { notImplemented } from "@/utilities/not-implemented";

export interface ValidResetToken {
  id: string;
  userId: string;
}

export async function create(_input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  requestedIp: string | null;
}): Promise<void> {
  return notImplemented("PasswordResetModel.create");
}

/** Token exists, not used, not expired, user ACTIVE. null otherwise. */
export async function findValidByHash(_tokenHash: string): Promise<ValidResetToken | null> {
  return notImplemented("PasswordResetModel.findValidByHash");
}

/** One transaction: mark the token used, set the new password hash, clear lockedUntil + failedLoginCount. */
export async function consume(_input: { tokenId: string; userId: string; passwordHash: string }): Promise<void> {
  return notImplemented("PasswordResetModel.consume");
}
