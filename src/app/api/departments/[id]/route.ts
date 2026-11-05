import { protectedRoute } from "@/middleware/route-handler";
import * as DepartmentController from "@/controller/department.controller";

export const GET = protectedRoute({ permissions: { all: ["departments.view"] } }, DepartmentController.get);
export const PATCH = protectedRoute({ permissions: { all: ["departments.update"] } }, DepartmentController.update);
