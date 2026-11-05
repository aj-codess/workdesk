import { Errors } from "@/utilities/api-error";

/**
 * Body of every function that is still open. Replace the call with the real implementation.
 * The route answers 501 until then (handled by handleError).
 */
export function notImplemented(name: string): never {
  throw Errors.notImplemented(name);
}
