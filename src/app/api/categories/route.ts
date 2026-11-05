import { protectedRoute } from "@/middleware/route-handler";
import * as CategoryController from "@/controller/category.controller";

export const GET = protectedRoute({ permissions: { all: ["categories.view"] } }, CategoryController.list);
export const POST = protectedRoute({ permissions: { all: ["categories.manage"] } }, CategoryController.create);
