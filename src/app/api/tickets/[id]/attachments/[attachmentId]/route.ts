import { protectedRoute } from "@/middleware/route-handler";
import * as AttachmentController from "@/controller/attachment.controller";

export const DELETE = protectedRoute({}, AttachmentController.remove);
