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

# --- Database migrations (fail hard) ---
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Exiting."
  exit 1
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."

exec npx next start -p "${PORT:-3000}"
