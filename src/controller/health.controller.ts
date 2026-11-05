import { success } from "@/utilities/api-response";
import * as HealthModel from "@/models/health.model";
import type { PublicContext } from "@/types/auth";

export async function live(_ctx: PublicContext) {
  return success({ status: "ok", uptime: process.uptime() });
}

export async function ready(_ctx: PublicContext) {
  const up = await HealthModel.pingDatabase();
  return success(
    { status: up ? "ok" : "degraded", database: up ? "up" : "down" },
    { status: up ? 200 : 503 }
  );
}
