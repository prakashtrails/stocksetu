#!/usr/bin/env bash
# Recreate the test database and apply bootstrap + migrations + seed.
set -e
cd "$(dirname "$0")/../.."
docker exec ss-pg psql -U postgres -q -c "drop database if exists ss" -c "create database ss" >/dev/null
for f in scripts/test-db/bootstrap.sql supabase/migrations/*.sql supabase/seed.sql supabase/seed_haldiram.sql; do
  echo "== $f"
  docker exec -i ss-pg psql -U postgres -d ss -v ON_ERROR_STOP=1 -q < "$f"
done
echo "== applied"
