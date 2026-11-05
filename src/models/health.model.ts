import { notImplemented } from "@/utilities/not-implemented";

/** Run `SELECT 1`. Return false (do not throw) when the database is unreachable. */
export async function pingDatabase(): Promise<boolean> {
  return notImplemented("HealthModel.pingDatabase");
}
