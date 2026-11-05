// External-module work: argon2id hashing and password generation.
import { notImplemented } from "@/utilities/not-implemented";

/** argon2id hash. */
export async function hash(_plain: string): Promise<string> {
  return notImplemented("PasswordService.hash");
}

/**
 * Verify a password. When `hash` is null (unknown email) still run a verification against a
 * dummy hash so response timing is uniform, then return false.
 */
export async function verify(_hash: string | null, _plain: string): Promise<boolean> {
  return notImplemented("PasswordService.verify");
}

/** Random password that satisfies the password policy (used when an admin omits one). */
export function generatePassword(): string {
  return notImplemented("PasswordService.generatePassword");
}
