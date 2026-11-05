import { protectedRoute } from "@/middleware/route-handler";
import * as TicketController from "@/controller/ticket.controller";

export const POST = protectedRoute({ permissions: { all: ["tickets.close"] } }, TicketController.close);
