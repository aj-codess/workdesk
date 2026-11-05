import { publicRoute } from "@/middleware/route-handler";
import * as HealthController from "@/controller/health.controller";

export const GET = publicRoute({}, HealthController.live);
