import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "@/utilities/api-error";
import { failure } from "@/utilities/api-response";
import {logger} from "@/utilities/logger";

export function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return failure(error.message, error.statusCode, error.details, error.code);
  }

  if (error instanceof ZodError) {
    return failure("Validation failed", 400, error.issues, "VALIDATION_ERROR");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return failure("A record with this value already exists", 409, undefined, "CONFLICT");
    }
    if (error.code === "P2025") {
      return failure("Record not found", 404, undefined, "NOT_FOUND");
    }
  }

  logger.error(`[API ERROR] - ${error}`)
  return failure("Internal server error", 500, undefined, "INTERNAL_ERROR");
}
