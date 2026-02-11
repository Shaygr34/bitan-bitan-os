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
  elif echo "$MIGRATE_OUTPUT" | grep -q "P3005"; then
    # P3005: database has pre-existing tables (e.g. Sumit Sync/Alembic)
    # but no Prisma migration history. Use db push to create any missing
    # tables from schema.prisma, then baseline the migration.
    echo "Detected P3005: database has existing tables but no Prisma migration history."
    echo "Running 'prisma db push' to create missing tables..."
    npx prisma db push --skip-generate --accept-data-loss
    echo "Baselining migration 20260211000000_content_factory_v0..."
    npx prisma migrate resolve --applied 20260211000000_content_factory_v0
  else
    # Unknown migration error — print output and fail.
    echo "$MIGRATE_OUTPUT"
    echo "FATAL: prisma migrate deploy failed (exit $MIGRATE_EXIT)."
    exit 1
  fi

  # Safety net: verify Content Factory tables actually exist.
  # Handles the case where a previous deploy baselined the migration
  # without running the DDL (e.g. P3005 marked as applied but tables missing).
  # Uses direct SQL execution — bypasses prisma db push which fails silently.
  echo "Running ensure-tables check..."
  node /app/apps/os-hub/scripts/ensure-tables.js

  echo "Migrations complete."
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
