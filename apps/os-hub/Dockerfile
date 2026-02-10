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

# Copy standalone output
COPY --from=build /app/apps/os-hub/.next/standalone ./
COPY --from=build /app/apps/os-hub/.next/static ./apps/os-hub/.next/static
COPY --from=build /app/apps/os-hub/public ./apps/os-hub/public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
