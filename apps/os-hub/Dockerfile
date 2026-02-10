# ---- deps ----
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy monorepo root manifests
COPY package.json pnpm-workspace.yaml ./
COPY apps/os-hub/package.json apps/os-hub/

RUN pnpm install --frozen-lockfile || pnpm install

# ---- build ----
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/os-hub/node_modules ./apps/os-hub/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/os-hub/ apps/os-hub/

ENV NODE_ENV=production
RUN pnpm --filter os-hub build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (structure depends on outputFileTracingRoot)
COPY --from=build /app/apps/os-hub/.next/standalone ./
COPY --from=build /app/apps/os-hub/.next/static ./apps/os-hub/.next/static
COPY --from=build /app/apps/os-hub/public ./apps/os-hub/public

# Startup script: dump diagnostics then find and run server.js
RUN printf '#!/bin/sh\necho "=== DEPLOY DIAGNOSTICS ==="\necho "Top-level /app:"\nls -la /app\necho ""\necho "node_modules/next:"\nls /app/node_modules/next/package.json 2>/dev/null && echo "FOUND" || echo "MISSING"\necho ""\necho "server.js locations:"\n[ -f /app/server.js ] && echo "  /app/server.js EXISTS" || echo "  /app/server.js MISSING"\n[ -f /app/apps/os-hub/server.js ] && echo "  /app/apps/os-hub/server.js EXISTS" || echo "  /app/apps/os-hub/server.js MISSING"\necho "========================"\nif [ -f /app/server.js ]; then\n  exec node /app/server.js\nelif [ -f /app/apps/os-hub/server.js ]; then\n  exec node /app/apps/os-hub/server.js\nelse\n  echo "FATAL: server.js not found"\n  ls -laR /app | head -100\n  exit 1\nfi\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
