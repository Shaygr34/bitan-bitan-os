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

# --- run_migrations: attempt migrate deploy, baseline on P3005 ---
run_migrations() {
  # Try migrate deploy; capture exit code without aborting (set +e locally).
  set +e
  MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
  MIGRATE_EXIT=$?
  set -e

  if [ $MIGRATE_EXIT -eq 0 ]; then
    echo "$MIGRATE_OUTPUT"
    echo "Migrations complete."
    return 0
  fi

  # Check for P3005 (database not empty, needs baseline).
  if echo "$MIGRATE_OUTPUT" | grep -q "P3005"; then
    echo "Detected P3005: database schema exists but is not baselined."
    echo "Baselining initial migration (20260211000000_content_factory_v0)..."
    npx prisma migrate resolve --applied 20260211000000_content_factory_v0
    echo "Baseline applied. Retrying migrate deploy..."
    npx prisma migrate deploy
    echo "Migrations complete."
    return 0
  fi

  # Unknown migration error — print output and fail.
  echo "$MIGRATE_OUTPUT"
  echo "FATAL: prisma migrate deploy failed (exit $MIGRATE_EXIT)."
  exit 1
}

# --- Database migrations ---
if [ "$IS_DEPLOYED" = "true" ]; then
  # Production / staging: DATABASE_URL is mandatory, migrations must succeed.
  if [ -z "$DATABASE_URL" ]; then
    echo "FATAL: DATABASE_URL is not set in deployed environment (NODE_ENV=${NODE_ENV}, RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-unset}). Exiting."
    exit 1
  fi
  echo "Running Prisma migrations (deployed environment)..."
  run_migrations
else
  # Local development: migrations are optional.
  if [ -n "$DATABASE_URL" ]; then
    echo "Running Prisma migrations (local development)..."
    run_migrations
  else
    echo "WARNING: DATABASE_URL is not set. Skipping migrations (local development mode)."
  fi
fi

exec npx next start -p "${PORT:-3000}"
