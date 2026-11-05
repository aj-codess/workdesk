import { protectedRoute } from "@/middleware/route-handler";
import * as TicketController from "@/controller/ticket.controller";

export const PATCH = protectedRoute({ permissions: { all: ["tickets.change_priority"] } }, TicketController.changePriority);
