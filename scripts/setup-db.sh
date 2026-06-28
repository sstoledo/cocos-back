#!/usr/bin/env bash
set -e

echo "Starting PostgreSQL with Docker..."
docker compose up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker exec cocos-postgres pg_isready -U postgres -d cocos >/dev/null 2>&1; do
  sleep 1
done

echo "PostgreSQL is ready."
echo ""
echo "Next steps:"
echo "  cp .env.template .env"
echo "  npm ci"
echo "  npx prisma migrate dev"
echo "  npm run start:dev"
