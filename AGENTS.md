# Cocos Backend — AI Code Review Rules

## Project Overview

Cocos is a mechanic-shop ERP backend built with NestJS. It exposes REST APIs for authentication, user management, and future workshop domains. Auth is session-based via `better-auth`, roles are custom on top of the `better-auth` user model, and PostgreSQL is the only supported database.

## Tech Stack

- **Runtime / framework:** Node 22, NestJS 10, Express
- **Language:** TypeScript 5.9, `tsconfig` target ES2021, CommonJS output
- **ORM:** Prisma 6 with `@prisma/client`
- **Auth:** `better-auth` with `emailAndPassword`, `emailVerification`, `resetPassword`
- **Validation:** `class-validator` + `class-transformer` via NestJS `ValidationPipe`
- **Package manager:** pnpm 9.15.0 (`preinstall` enforces `only-allow pnpm`)
- **Formatter / linter:** Biome 1.9.4

## Conventions

### Naming

- Classes use PascalCase: `UsersController`, `RolesGuard`, `PrismaService`.
- Files use kebab-case and reflect the exported symbol: `roles.decorator.ts`, `role.guard.ts`, `users.service.ts`.
- barrel files: `src/auth/index.ts` re-exports public members.

### Module structure

- One feature per folder under `src/<feature>/`.
- Each feature exports a module: `<feature>.module.ts`.
- Public API surface: `*.controller.ts` (HTTP), `*.service.ts` (business logic), optional `*.guard.ts`, `*.decorator.ts`.
- Register modules in `src/app.module.ts`.

### Imports

- Prefer `@nestjs/*` and `@prisma/client` named imports.
- Use `import type { ... }` for type-only imports.
- Internal imports use relative paths from the same feature (`./role.guard`) or barrel (`../auth`).
- Do not add path aliases beyond the existing base URL; NestJS resolves relative imports.
- Exception for tests: when a barrel file re-exports an ESM-only dependency that Jest cannot transform (e.g., `better-auth`), tests may import guards/decorators directly from their source files to avoid loading that dependency.

### Formatting

- Enforced by Biome: 2-space indentation, LF line endings, 80-character line width.
- Single quotes, semicolons always, trailing commas ES5.
- Run `pnpm check:fix` before committing.

## Testing Rules

- **Strict TDD:** RED → GREEN → REFACTOR. Write the failing test first, then the minimal implementation, then refactor.
- Unit tests: co-located with source as `*.spec.ts`, run with `pnpm test`.
- E2E tests live in `test/*.e2e-spec.ts` and use `supertest` + NestJS `Test.createTestingModule`.
- Mock external boundaries: Prisma service, `better-auth` session helpers (`auth.api.getSession`, `fromNodeHeaders`).
- Reset mocks in `beforeEach` with `jest.clearAllMocks()`.
- Do not hit real PostgreSQL in unit or E2E tests; override `PrismaService` with a mock value.

## Security Rules

- **Never persist passwords or secrets in code.** Use `ConfigService` and `.env`/`.env.template`.
- **Auth routes:** mount `better-auth` handler at `/api/auth` via `toNodeHandler(auth)` in `bootstrap()`.
- **Session validation:** always retrieve the session through `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`.
- **Authorization:** protect routes with `@UseGuards(RolesGuard)` and `@Roles(RoleName.Admin, ...)`.
- `RolesGuard` must throw `UnauthorizedException` when there is no session or the user/role is missing, and `ForbiddenException` only when the role is insufficient.
- Prisma queries must scope data by the authenticated user or role when required; do not trust client-provided IDs without validation.

## PR Review Focus

- Does the new feature follow the module/controller/service/guard/decorator split?
- Are Prisma queries efficient and safe (index usage, no N+1, proper `where` clauses)?
- Is role-based access declared with `@Roles` and enforced by `RolesGuard`?
- Are tests written first and do they fail meaningfully before the implementation exists?
- Does the change pass `pnpm check` and `pnpm test` without warnings?
- Are `.env` changes reflected in `.env.template` and documented?

## Forbidden Patterns

- Do not create controllers or services without tests.
- Do not call `new PrismaClient()` in business logic; inject `PrismaService`. Exception: `src/auth/auth.ts` may create a dedicated `PrismaClient` for `better-auth` initialization because the auth instance is needed before NestJS dependency injection is available.
- Do not bypass `RolesGuard` on state-changing endpoints.
- Do not use `any` without a `// biome-ignore lint/suspicious/noExplicitAny: <reason>` comment.
- Do not commit `console.log`, `debugger`, or temporary `skip`/`only` in tests.
- Do not add migrations or seed scripts without updating `prisma.seed` config when relevant.
- Do not change Biome rules in the same PR as feature code unless the change is required to fix a compilation or lint failure introduced by the feature (e.g., NestJS decorator metadata requires disabling `style/useImportType`).
