import { protectedRoute } from "@/middleware/route-handler";
import { TICKET_VIEW_PERMISSIONS } from "@/config/permissions";
import * as CommentController from "@/controller/comment.controller";

export const GET = protectedRoute({ permissions: { any: TICKET_VIEW_PERMISSIONS } }, CommentController.list);
export const POST = protectedRoute({ permissions: { all: ["tickets.comment"] } }, CommentController.create);
