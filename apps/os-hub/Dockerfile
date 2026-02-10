# ---- deps ----
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

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
# Non-standalone: copies real node_modules + built .next, runs next start.
# Larger image but guaranteed to work. Optimize to standalone later.
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy monorepo manifests (pnpm needs them to resolve workspace packages)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

# Copy real node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/os-hub/node_modules ./apps/os-hub/node_modules

# Copy built app
COPY --from=build /app/apps/os-hub/package.json ./apps/os-hub/
COPY --from=build /app/apps/os-hub/.next ./apps/os-hub/.next
COPY --from=build /app/apps/os-hub/public ./apps/os-hub/public

# Diagnostics on startup, then run next start
RUN printf '#!/bin/sh\necho "=== DEPLOY DIAGNOSTICS ==="\necho "node_modules/next:"\nls /app/node_modules/next/package.json 2>/dev/null && echo "FOUND" || echo "MISSING"\necho "apps/os-hub/.next:"\nls /app/apps/os-hub/.next/BUILD_ID 2>/dev/null && echo "FOUND" || echo "MISSING"\necho "PORT=${PORT:-3000}"\necho "NODE_ENV=${NODE_ENV}"\necho "========================"\ncd /app/apps/os-hub\nexec npx next start -p ${PORT:-3000}\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
