#!/usr/bin/env bash
# Sets up a local dev/test environment: installs deps, starts Postgres,
# creates the dev and E2E databases, applies migrations, and generates the
# Prisma client.
#
# Usage:
#   ./scripts/setup-dev.sh          # full setup
#   ./scripts/setup-dev.sh --build  # also `npm run build` (needed once before
#                                    # `npm run test:e2e`, which starts the app
#                                    # with `next start`)
#
# Assumes a Debian/Ubuntu-style image with the `postgresql` apt package
# already installed (as in this project's containers) and passwordless sudo
# for the `postgres` service user. Safe to re-run.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB_USER="postgres"
DB_PASSWORD="postgres"
DB_HOST="localhost"
DB_PORT="5432"
DEV_DB="studio"
E2E_DB="studio_e2e"

echo "==> Installing npm dependencies"
npm install

echo "==> Starting PostgreSQL"
if command -v pg_lsclusters >/dev/null 2>&1; then
  # Debian/Ubuntu-style cluster management.
  if ! pg_lsclusters | awk '{print $4}' | grep -q "^online$"; then
    sudo service postgresql start
  fi
else
  echo "    pg_lsclusters not found; assuming Postgres is managed some other way."
fi

echo "==> Waiting for Postgres to accept connections"
for _ in $(seq 1 30); do
  if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';" >/dev/null 2>&1 || true
  sleep 1
done

echo "==> Ensuring the postgres role has a known password"
sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';" >/dev/null

echo "==> Creating databases ($DEV_DB, $E2E_DB) if missing"
for db in "$DEV_DB" "$E2E_DB"; do
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 \
    || sudo -u postgres createdb "$db"
done

DEV_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DEV_DB?schema=public"
E2E_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$E2E_DB?schema=public"

echo "==> Generating Prisma client"
DATABASE_URL="$DEV_DATABASE_URL" npx prisma generate

echo "==> Applying migrations to $DEV_DB"
DATABASE_URL="$DEV_DATABASE_URL" npx prisma migrate deploy

echo "==> Applying migrations to $E2E_DB"
DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy

if [[ "${1:-}" == "--build" ]]; then
  echo "==> Building the app (npm run build)"
  npm run build
fi

if [[ -f /opt/pw-browsers/chromium-1194/chrome-linux/chrome ]]; then
  CHROMIUM_PATH="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
else
  CHROMIUM_PATH=""
fi

cat <<EOF

==> Done.

For local dev, if you don't already have one:
  cp .env.example .env.local   # then fill in OPENROUTER_API_KEY
  DATABASE_URL="$DEV_DATABASE_URL"

To run the full suite:
  npm test          # unit, golden-file, compile and runtime -- no services needed
  npm run typecheck
  npm run lint
  E2E_DATABASE_URL="$E2E_DATABASE_URL" \\
  ${CHROMIUM_PATH:+CHROMIUM_PATH="$CHROMIUM_PATH" }\\
  npm run test:e2e  # needs the build above and a Chromium; browser E2E

EOF
