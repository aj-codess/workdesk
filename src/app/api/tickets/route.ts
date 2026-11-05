import { protectedRoute } from "@/middleware/route-handler";
import { TICKET_VIEW_PERMISSIONS } from "@/config/permissions";
import * as TicketController from "@/controller/ticket.controller";

export const GET = protectedRoute({ permissions: { any: TICKET_VIEW_PERMISSIONS } }, TicketController.list);
export const POST = protectedRoute({ permissions: { all: ["tickets.create"] } }, TicketController.create);
