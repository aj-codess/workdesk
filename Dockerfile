# syntax=docker/dockerfile:1
# Multi-stage build. Targets: `migrate` (one-off: prisma migrate deploy + seed) and `runner` (the API, default).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=true
RUN npm run build

# One-off job: apply migrations and seed. Needs the Prisma CLI, so it keeps the full dependency tree.
FROM builder AS migrate
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app \
 && mkdir -p /app/storage/uploads && chown -R app:app /app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
# Native modules and the generated Prisma client are traced into standalone, but the query engine file is copied explicitly.
COPY --from=builder --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
USER app
EXPOSE 4000
VOLUME ["/app/storage/uploads"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
