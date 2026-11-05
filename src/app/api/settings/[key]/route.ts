import { protectedRoute } from "@/middleware/route-handler";
import * as SettingController from "@/controller/setting.controller";

export const GET = protectedRoute({ permissions: { all: ["settings.view"] } }, SettingController.get);
export const PUT = protectedRoute({ permissions: { all: ["settings.update"] } }, SettingController.update);
