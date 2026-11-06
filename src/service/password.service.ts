// External-module work: argon2id hashing and password generation.
import { randomInt } from "node:crypto";
import argon2 from "argon2";

const OPTIONS = {
  raw: false as const,
  type: argon2.argon2id as 2,
  memoryCost: 19456, // 19 MiB, OWASP minimum profile for argon2id
  timeCost: 2,
  parallelism: 1,
};

let dummyHash: Promise<string> | undefined;

/** argon2id hash. */
export async function hash(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

/**
 * Verify a password. When `hash` is null (unknown email) still run a verification against a
 * dummy hash so response timing is uniform, then return false.
 */
export async function verify(storedHash: string | null, plain: string): Promise<boolean> {
  if (storedHash === null) {
    dummyHash ??= argon2.hash("workdesk-timing-equaliser", OPTIONS);
    await argon2.verify(await dummyHash, plain).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(storedHash, plain);
  } catch {
    return false;
  }
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*-_+=?";

function pick(set: string): string {
  return set[randomInt(set.length)]!;
}

/** Random password that satisfies the password policy (used when an admin omits one). */
export function generatePassword(): string {
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
