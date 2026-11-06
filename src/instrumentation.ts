// Runs once when the server starts. In production a bad or unsafe configuration stops the process here
// instead of surfacing as 500s on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { env } = await import("@/config/env");
    void env.NODE_ENV; // forces validation; throws with a readable list of problems
  }
}
