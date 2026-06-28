# Cocos Back

NestJS + Prisma + better-auth backend for the Cocos workshop ERP MVP.

## Stack

- [NestJS 10](https://nestjs.com/)
- [Prisma 6](https://www.prisma.io/)
- [better-auth](https://www.better-auth.com/) (email/password, reset password, email verification)
- PostgreSQL
- Cloudinary (product images)

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Cloudinary account (for image uploads)

### Install

```bash
cp .env.template .env
# edit .env with your credentials
npm install
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
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

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
