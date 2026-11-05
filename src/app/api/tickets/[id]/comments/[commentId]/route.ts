import { protectedRoute } from "@/middleware/route-handler";
import * as CommentController from "@/controller/comment.controller";

export const PATCH = protectedRoute({}, CommentController.update);
export const DELETE = protectedRoute({}, CommentController.remove);
