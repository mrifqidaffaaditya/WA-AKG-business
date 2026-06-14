#!/bin/sh
set -e

mkdir -p /app/data /app/sessions /app/public/uploads

echo "yes" | npx tsx src/db/migrate.ts
npx tsx src/seed-runner.ts

exec node dist/index.js
