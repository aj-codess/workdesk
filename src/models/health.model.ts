import { prisma } from "@/config/prisma";

/** Run `SELECT 1`. Return false (do not throw) when the database is unreachable. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
