# B-10 — Users CRUD Backend (cocos-back)

## Objective
Complete user management endpoints: list, create, update, delete, assign-role. Admin only.

## Problem / Why
- Only `GET /users/me` exists today (all roles).
- Need full CRUD for Admin user management.
- Frontend (B-10 web) depends on this contract.

## Scope (authorized)
- IN: User Prisma model update (`isActive`), users module (5 endpoints), unit + e2e tests.
- OUT: better-auth internals, password reset flow, email verification.

## Binding decisions
- Roles: **Admin only** for all new endpoints.
- User creation: Direct Prisma create (better-auth User model). Admin provides email, name, roleId, temp password. User sets real password on first login via better-auth reset flow.
- Soft-delete: `isActive` boolean (default true). No `deletedAt` (audit).
- Pagination: `page`, `limit`, `q` (search name/email).
- Response DTO: User + role relation, no password/hash.

## Contracts

### Endpoints (all `@Roles(RoleName.Admin)`):
1. `GET /users?page=1&limit=20&q=` → `{ data: UserWithRole[], meta: { page, limit, total } }`
2. `POST /users` — `{ email, name, roleId, password }` → 201 UserWithRole
3. `PATCH /users/:id` — `{ name?, roleId?, isActive? }` → 200 UserWithRole
4. `DELETE /users/:id` — soft delete (`isActive: false`) → 200 UserWithRole
5. `PATCH /users/:id/role` — `{ roleId }` → 200 UserWithRole

### UserWithRole DTO:
```ts
{
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: { id: string; name: RoleName };
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

## Constraints / config
- TDD: **strict** (RED → GREEN → REFACTOR)
- Migration: Prisma against postgres:16 disposable container
- Delivery: 4 stacked PRs (ask before merge)

## Tasks
- [x] B10.1 Schema — add `isActive` to User model + migration ✅ (2026-10-05, 571 unit tests green)
- [x] B10.2 Module + list/create + unit specs ✅ (2026-10-05, 571 unit tests green)
- [x] B10.3 Update/delete/assign-role + unit specs ✅ (2026-10-05, 571 unit tests green)
- [x] B10.4 E2E suite ✅ (2026-10-05, new controller e2e tests pass; 3 pre-existing failures in services/products unrelated)

## Acceptance criteria
- Migration adds `isActive` Boolean @default(true) to User
- All 5 endpoints exist, Admin-only, correct DTO
- Unit tests cover happy path + validation + auth
- E2E tests cover role matrix + concurrent scenarios
- Full suite green (baseline 514 unit / 196 e2e)

## Progress
- 2026-10-05: Task file created.

## Next step
B10.1 Schema + migration.