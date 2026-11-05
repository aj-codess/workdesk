import { protectedRoute } from "@/middleware/route-handler";
import { TICKET_VIEW_PERMISSIONS } from "@/config/permissions";
import * as TicketController from "@/controller/ticket.controller";

export const GET = protectedRoute({ permissions: { any: TICKET_VIEW_PERMISSIONS } }, TicketController.get);
export const PATCH = protectedRoute({ permissions: { any: ["tickets.update_own", "tickets.update_assigned"] } }, TicketController.update);
export const DELETE = protectedRoute({ permissions: { all: ["tickets.delete"] } }, TicketController.remove);
