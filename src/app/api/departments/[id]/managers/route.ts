import { protectedRoute } from "@/middleware/route-handler";
import * as DepartmentController from "@/controller/department.controller";

export const GET = protectedRoute({ permissions: { all: ["departments.view"] } }, DepartmentController.listManagers);
export const POST = protectedRoute({ permissions: { all: ["departments.manage_members"] } }, DepartmentController.addManager);
