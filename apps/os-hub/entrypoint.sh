#!/bin/sh
set -e

echo "=== DEPLOY DIAGNOSTICS ==="
echo "Next.js: $(ls /app/apps/os-hub/.next/BUILD_ID 2>/dev/null && echo FOUND || echo MISSING)"
echo "Engine:  $(ls /app/engines/content-engine/engine.py 2>/dev/null && echo FOUND || echo MISSING)"
echo "Python:  $(python3 --version 2>&1 || echo MISSING)"
echo "Chrome:  $(chromium-browser --version 2>&1 || echo MISSING)"
echo "PORT=${PORT:-3000} NODE_ENV=${NODE_ENV} RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-unset}"
echo "========================"

cd /app/apps/os-hub

# --- Environment detection ---
# Deployed = production NODE_ENV or any Railway-managed environment (staging, production, PR preview).
IS_DEPLOYED="false"
if [ "$NODE_ENV" = "production" ] || [ -n "$RAILWAY_ENVIRONMENT" ]; then
  IS_DEPLOYED="true"
fi

# --- Database migrations ---
if [ "$IS_DEPLOYED" = "true" ]; then
  # Production / staging: DATABASE_URL is mandatory, migrations must succeed.
  if [ -z "$DATABASE_URL" ]; then
    echo "FATAL: DATABASE_URL is not set in deployed environment (NODE_ENV=${NODE_ENV}, RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-unset}). Exiting."
    exit 1
  fi
  echo "Running Prisma migrations (deployed environment)..."
  npx prisma migrate deploy
  echo "Migrations complete."
else
  # Local development: migrations are optional.
  if [ -n "$DATABASE_URL" ]; then
    echo "Running Prisma migrations (local development)..."
    npx prisma migrate deploy
    echo "Migrations complete."
  else
    echo "WARNING: DATABASE_URL is not set. Skipping migrations (local development mode)."
  fi
fi

exec npx next start -p "${PORT:-3000}"
