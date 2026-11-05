import { protectedRoute } from "@/middleware/route-handler";
import * as CategoryController from "@/controller/category.controller";

export const GET = protectedRoute({ permissions: { all: ["categories.view"] } }, CategoryController.get);
export const PATCH = protectedRoute({ permissions: { all: ["categories.manage"] } }, CategoryController.update);
