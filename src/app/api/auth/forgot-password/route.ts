import { publicRoute } from "@/middleware/route-handler";
import { RATE_LIMITS } from "@/config/rate-limits";
import * as AuthController from "@/controller/auth.controller";

export const POST = publicRoute({ rateLimit: RATE_LIMITS.forgotPassword }, AuthController.forgotPassword);
