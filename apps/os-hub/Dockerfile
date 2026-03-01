# ---- deps ----
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/os-hub/package.json apps/os-hub/
# Prisma schema needed for postinstall: prisma generate
COPY apps/os-hub/prisma/ apps/os-hub/prisma/

RUN pnpm install --frozen-lockfile || pnpm install

# ---- build ----
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/os-hub/node_modules ./apps/os-hub/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/os-hub/ apps/os-hub/

# Copy Content Engine source (single COPY — relies on .dockerignore for exclusions)
COPY engines/content-engine/ engines/content-engine/

ENV NODE_ENV=production
# Generate Prisma Client before Next.js build
RUN cd apps/os-hub && npx prisma generate
RUN pnpm --filter os-hub build

# ---- runner ----
# Includes Node.js (Next.js app) + Python 3 + Chromium (Content Engine pipeline).
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Content Engine runtime dependencies:
#   python3 + py3-jinja2  — DOCX parser + HTML templating
#   chromium              — headless PDF rendering (--print-to-pdf)
#   ttf-dejavu            — Hebrew-capable fallback font (DejaVu Sans)
#   nss, freetype, harfbuzz, ca-certificates — Chromium runtime deps on Alpine
RUN apk add --no-cache \
    python3 \
    py3-jinja2 \
    chromium \
    ttf-dejavu \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    && rm -rf /var/cache/apk/*

ENV NODE_ENV=production
ENV PORT=3000
# Explicit engine path so runner.ts finds it regardless of CWD
ENV CONTENT_ENGINE_DIR=/app/engines/content-engine

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy monorepo manifests (pnpm needs them to resolve workspace packages)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

# Copy real node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/os-hub/node_modules ./apps/os-hub/node_modules

# Copy built Next.js app
COPY --from=build /app/apps/os-hub/package.json ./apps/os-hub/
COPY --from=build /app/apps/os-hub/.next ./apps/os-hub/.next
COPY --from=build /app/apps/os-hub/public ./apps/os-hub/public

# Copy Prisma schema + migrations (needed for prisma migrate deploy at runtime)
COPY --from=build /app/apps/os-hub/prisma ./apps/os-hub/prisma

# Copy prompt templates (needed for AI draft generation)
COPY --from=build /app/apps/os-hub/prompts ./apps/os-hub/prompts

# Copy Content Engine from build stage (avoids per-subdirectory context issues)
COPY --from=build /app/engines/content-engine/ engines/content-engine/

# Writable dirs for the non-root nextjs user
RUN mkdir -p engines/content-engine/output && \
    chown -R nextjs:nodejs engines/content-engine/output && \
    mkdir -p /tmp/content-engine-history && \
    chown nextjs:nodejs /tmp/content-engine-history

# Entrypoint: diagnostics + environment-aware migrations + next start
# Use --from=build (not raw context) — Railway BuildKit drops context for later stages
COPY --from=build /app/apps/os-hub/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
