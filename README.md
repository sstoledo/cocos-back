# Cocos Back

NestJS + Prisma + better-auth backend for the Cocos workshop ERP MVP.

## Stack

- [Node.js 22 LTS](https://nodejs.org/)
- [NestJS 10](https://nestjs.com/)
- [Prisma 6](https://www.prisma.io/)
- [better-auth](https://www.better-auth.com/) (email/password, reset password, email verification)
- PostgreSQL 16
- Cloudinary (product images)
- [Biome](https://biomejs.dev/) (lint + format)

## Getting started

### Prerequisites

- Node.js 22 LTS (use `.nvmrc`)
- npm 10+
- Docker (for PostgreSQL)
- Cloudinary account (for image uploads)

### Supply-chain safety

This project pins exact dependency versions and requires the Node version declared in `.nvmrc`:

```bash
nvm use          # reads .nvmrc
npm ci           # installs exact versions from package-lock.json
```

Never use `npm install` in production or before a release; it can bump versions silently. Run `npm run audit` periodically to check for known vulnerabilities.

### Database setup

```bash
# Start PostgreSQL in Docker and wait until it is healthy
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh
```

Then copy the environment file and run the first migration:

```bash
cp .env.template .env
# edit .env if needed (defaults match the Docker Compose service)
npm ci
npx prisma migrate dev
npm run start:dev
```

The API runs on `http://localhost:4000/api`. Auth handlers are mounted at `/api/auth/*`.

## Environment variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `BETTER_AUTH_SECRET` | Secret for better-auth session signing | Yes |
| `BETTER_AUTH_URL` | Public base URL of the backend (e.g. `http://localhost:4000`) | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |
| `FRONTEND_URL` | Allowed CORS origin | No |
| `PORT` | Port to listen on (default `4000`) | No |

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Run in watch mode |
| `npm run build` | Production build |
| `npm run test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | Biome lint |
| `npm run lint:fix` | Biome lint with auto-fix |
| `npm run format` | Biome format |
| `npm run format:check` | Check Biome formatting |
| `npm run check` | Biome lint + format |
| `npm run audit` | Check for known vulnerabilities |
| `npm run audit:fix` | Auto-fix non-breaking vulnerabilities |

## Project structure

```
src/
  auth/           better-auth configuration
  health/         Health check endpoint
  prisma/         Prisma service and module
  app.module.ts   Root module
  main.ts         Application bootstrap
prisma/
  schema.prisma   Database schema
```
