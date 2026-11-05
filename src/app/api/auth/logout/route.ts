import { publicRoute } from "@/middleware/route-handler";
import * as AuthController from "@/controller/auth.controller";

export const POST = publicRoute({}, AuthController.logout);
