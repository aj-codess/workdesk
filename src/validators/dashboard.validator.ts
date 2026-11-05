import { z } from "zod";
import { uuid } from "@/validators/common";

export const departmentDashboardQuery = z.object({ departmentId: uuid.optional() });
