import { protectedRoute } from "@/middleware/route-handler";
import { TICKET_VIEW_PERMISSIONS } from "@/config/permissions";
import * as TicketController from "@/controller/ticket.controller";

export const GET = protectedRoute({ permissions: { any: TICKET_VIEW_PERMISSIONS } }, TicketController.listActivity);
