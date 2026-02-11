#!/bin/sh
set -e

echo "=== DEPLOY DIAGNOSTICS ==="
echo "Next.js: $(ls /app/apps/os-hub/.next/BUILD_ID 2>/dev/null && echo FOUND || echo MISSING)"
echo "Engine:  $(ls /app/engines/content-engine/engine.py 2>/dev/null && echo FOUND || echo MISSING)"
echo "Python:  $(python3 --version 2>&1 || echo MISSING)"
echo "Chrome:  $(chromium-browser --version 2>&1 || echo MISSING)"
echo "PORT=${PORT:-3000} NODE_ENV=${NODE_ENV}"
echo "========================"

cd /app/apps/os-hub

# --- Database migrations (optional) ---
if [ -n "$DATABASE_URL" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy 2>&1 || echo "WARNING: Prisma migrate failed"
  echo "Migrations complete."
else
  echo "DATABASE_URL not set — skipping Prisma migrations"
fi

exec npx next start -p "${PORT:-3000}"
