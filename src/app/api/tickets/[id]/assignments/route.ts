import { protectedRoute } from "@/middleware/route-handler";
import * as TicketController from "@/controller/ticket.controller";

export const GET = protectedRoute({}, TicketController.listAssignments);
