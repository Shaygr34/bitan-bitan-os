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

# --- log_db_diagnostics: print connection + schema evidence ---
log_db_diagnostics() {
  echo "=== DB DIAGNOSTICS ==="
  # 1) Masked DATABASE_URL (host + dbname + schema, no password)
  node -e "
    const url = process.env.DATABASE_URL || '';
    const masked = url.replace(/:\/\/[^@]*@/, '://***@');
    console.log('DATABASE_URL (masked):', masked || 'NOT SET');
  "
  # 2) Prisma version
  npx prisma -v 2>&1 | head -5

  # 3) DB checks via information_schema (avoids regclass deserialization bug)
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      try {
        const dbInfo = await prisma.\$queryRawUnsafe('SELECT current_database() AS db, current_schema() AS schema');
        console.log('current_database / current_schema:', JSON.stringify(dbInfo));

        const tables = await prisma.\$queryRawUnsafe(
          \"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name\"
        );
        console.log('public tables:', JSON.stringify(tables.map(t => t.table_name)));

        const cfMig = await prisma.\$queryRawUnsafe(
          \"SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations WHERE migration_name LIKE '%content_factory%'\"
        ).catch(() => []);
        console.log('content_factory migrations:', JSON.stringify(cfMig));
      } catch (e) {
        console.error('DB diagnostics error:', e.message);
      } finally {
        await prisma.\$disconnect();
      }
    })();
  "
  echo "=== END DB DIAGNOSTICS ==="
}

# --- run_migrations: migrate deploy, baseline on P3005, fail loudly ---
run_migrations() {
  echo "--- Prisma migrate status (before deploy) ---"
  npx prisma migrate status 2>&1 || true

  echo "--- Running prisma migrate deploy ---"
  set +e
  MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
  MIGRATE_EXIT=$?
  set -e

  echo "$MIGRATE_OUTPUT"

  if [ $MIGRATE_EXIT -eq 0 ]; then
    echo "prisma migrate deploy: SUCCESS"
  elif echo "$MIGRATE_OUTPUT" | grep -q "P3005"; then
    # P3005: database has pre-existing tables but no _prisma_migrations table.
    # Baseline the migration so future deploys are clean.
    echo "Detected P3005: database has existing tables but no Prisma migration history."
    echo "Baselining migration 20260211000000_content_factory_v0..."
    npx prisma migrate resolve --applied 20260211000000_content_factory_v0
    echo "Re-running prisma migrate deploy after baseline..."
    npx prisma migrate deploy
  else
    echo "FATAL: prisma migrate deploy failed (exit $MIGRATE_EXIT)."
    exit 1
  fi

  # Post-migration diagnostics
  log_db_diagnostics

  # Soft check: verify articles table exists (warning only — never block startup)
  set +e
  ARTICLES_EXISTS=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      try {
        const r = await prisma.\$queryRawUnsafe(
          \"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'articles') AS exists\"
        );
        console.log(r[0].exists ? 'YES' : 'NO');
      } catch (e) {
        console.log('ERROR');
      } finally {
        await prisma.\$disconnect();
      }
    })();
  ")
  set -e

  if [ "$ARTICLES_EXISTS" = "YES" ]; then
    echo "Migrations complete — articles table verified."
  else
    echo "WARNING: articles table check returned '$ARTICLES_EXISTS' (expected YES)."
    echo "This may indicate a migration issue, but Next.js will start anyway."
    echo "Content Factory API routes may return errors until the DB is fixed."
  fi
}

# --- Database migrations ---
if [ "$IS_DEPLOYED" = "true" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "FATAL: DATABASE_URL is not set in deployed environment (NODE_ENV=${NODE_ENV}, RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-unset}). Exiting."
    exit 1
  fi
  echo "Running Prisma migrations (deployed environment)..."
  log_db_diagnostics
  run_migrations
else
  if [ -n "$DATABASE_URL" ]; then
    echo "Running Prisma migrations (local development)..."
    log_db_diagnostics
    run_migrations
  else
    echo "WARNING: DATABASE_URL is not set. Skipping migrations (local development mode)."
  fi
fi

exec npx next start -p "${PORT:-3000}"
