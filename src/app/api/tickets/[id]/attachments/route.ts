import { protectedRoute } from "@/middleware/route-handler";
import { TICKET_VIEW_PERMISSIONS } from "@/config/permissions";
import * as AttachmentController from "@/controller/attachment.controller";

export const GET = protectedRoute({ permissions: { any: TICKET_VIEW_PERMISSIONS } }, AttachmentController.list);
export const POST = protectedRoute({}, AttachmentController.upload);
