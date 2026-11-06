import { publicRoute } from "@/middleware/route-handler";
import * as HousekeepingController from "@/controller/housekeeping.controller";

export const dynamic = "force-dynamic";

export const POST = publicRoute({}, HousekeepingController.run);
