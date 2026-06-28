#!/usr/bin/env bash
set -e

# Detect docker compose command (plugin v2 vs standalone v1)
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "ERROR: docker compose is not installed." >&2
  echo "" >&2
  echo "Install it for your distribution:" >&2
  echo "  Arch / CachyOS: sudo pacman -S docker-compose" >&2
  echo "  Ubuntu / Debian: sudo apt install docker-compose-plugin" >&2
  echo "  Fedora: sudo dnf install docker-compose" >&2
  exit 1
fi

echo "Starting PostgreSQL with Docker using: ${COMPOSE_CMD}"
${COMPOSE_CMD} up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker exec cocos-postgres pg_isready -U postgres -d cocos >/dev/null 2>&1; do
  sleep 1
done

echo "PostgreSQL is ready."
echo ""
echo "Next steps:"
echo "  cp .env.template .env"
echo "  pnpm install"
echo "  pnpm exec prisma migrate dev"
echo "  pnpm start:dev"
