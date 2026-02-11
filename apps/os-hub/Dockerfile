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

# Copy Content Engine (Python DOCX→PDF pipeline)
COPY engines/content-engine/__init__.py engines/content-engine/
COPY engines/content-engine/engine.py engines/content-engine/
COPY engines/content-engine/brand_config.py engines/content-engine/
COPY engines/content-engine/parser/ engines/content-engine/parser/
COPY engines/content-engine/renderer/ engines/content-engine/renderer/
COPY engines/content-engine/templates/ engines/content-engine/templates/
COPY engines/content-engine/assets/ engines/content-engine/assets/

# Writable dirs for the non-root nextjs user
RUN mkdir -p engines/content-engine/output && \
    chown -R nextjs:nodejs engines/content-engine/output && \
    mkdir -p /tmp/content-engine-history && \
    chown nextjs:nodejs /tmp/content-engine-history

# Startup diagnostics + next start
RUN printf '#!/bin/sh\n\
echo "=== DEPLOY DIAGNOSTICS ==="\n\
echo "Next.js: $(ls /app/apps/os-hub/.next/BUILD_ID 2>/dev/null && echo FOUND || echo MISSING)"\n\
echo "Engine:  $(ls /app/engines/content-engine/engine.py 2>/dev/null && echo FOUND || echo MISSING)"\n\
echo "Python:  $(python3 --version 2>&1 || echo MISSING)"\n\
echo "Chrome:  $(chromium-browser --version 2>&1 || echo MISSING)"\n\
echo "PORT=${PORT:-3000} NODE_ENV=${NODE_ENV}"\n\
echo "========================"\n\
cd /app/apps/os-hub\n\
exec npx next start -p ${PORT:-3000}\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
