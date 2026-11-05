import { protectedRoute } from "@/middleware/route-handler";
import * as DepartmentController from "@/controller/department.controller";

export const DELETE = protectedRoute({ permissions: { all: ["departments.manage_members"] } }, DepartmentController.removeMember);
