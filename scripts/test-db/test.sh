#!/usr/bin/env bash
# Fresh database + all scenario checks. Needs the ss-pg container (see README).
set -e
cd "$(dirname "$0")/../.."
bash scripts/test-db/apply.sh >/dev/null
docker exec -i ss-pg psql -U postgres -d ss -q < scripts/test-db/checks.sql 2>&1 | sed 's/^psql:<stdin>:[0-9]*: //; s/^NOTICE:  //'
