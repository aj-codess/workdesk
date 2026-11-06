import { defineConfig } from "vitest/config";

// End-to-end tests run against a LIVE server (E2E_BASE_URL, default http://localhost:4000) with the demo seed loaded:
//   SEED_DEMO=true npm run prisma:seed && npm run dev   (or a production build)
// The server must run with TRUST_PROXY=true so every test client can present its own X-Forwarded-For address.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 40_000,
    hookTimeout: 40_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
