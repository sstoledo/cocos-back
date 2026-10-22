# Test Audit — cocos-back (Phase 0)

> Read-only inventory produced by Phase 0 of the Cocos testing portfolio (`proyectotesting.md`).
> Executed 2026-10-21 on branch `test/test-inventory-audit`.
> **Policy: nothing was modified or deleted in this phase.** MIGRATE/DELETE execution happens in the
> phase that provides the replacement (Phase 1 integration suites must be green first).

## Baseline (observed)

| Layer | Command | Result |
|---|---|---|
| Unit (Jest) | `pnpm test` | 53 suites · **646/646 pass** |
| E2E (Jest, mocked Prisma over supertest) | `pnpm test:e2e` | 13 suites · **223/228 pass · 5 failures** |

Known e2e failures at baseline:
- `products.e2e-spec.ts` ×3 and `services.e2e-spec.ts` ×1 — pre-existing on `main`.
- `users.e2e-spec.ts` ×1 `/users/me` — **stale assertion**: the spec expects the old body
  without `employeeId`/`employee`; PR #94 added them (intended contract). Test body needs
  updating when migrated; behavior is correct.

## Summary

| Bucket | Count |
|---|---|
| KEEP | 48 |
| MIGRATE | 10 (5 unit services + 5 e2e suites) |
| DELETE | 8 (mocked e2e duplicates) |
| Total | 66 |

## Inventory

### src unit specs (53)

| Path | Bucket | Reason | Exec phase |
|---|---|---|---|
| `src/auth/default-role.hook.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/auth/role.guard.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/auth/roles.decorator.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/brands/brands.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/brands/brands.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/cash-closings/cash-closings.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/cash-closings/cash-closings.service.spec.ts` | MIGRATE | transactional behavior faked with hand-rolled Prisma mocks | Phase 1 |
| `src/cash-closings/dto/cash-closing.response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/cash-closings/dto/create-cash-closing.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/categories/categories.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/categories/categories.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/clients/clients.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/clients/clients.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/clients/validators/identification.validator.spec.ts` | KEEP | pure logic via real decorator/helper | — |
| `src/common/helpers/plate.helper.spec.ts` | KEEP | pure logic via real decorator/helper | — |
| `src/dashboard/dashboard.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/dashboard/dashboard.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/employees/employees.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/employees/employees.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/lots/lots.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/lots/lots.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/notifications/notifications.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/notifications/notifications.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/presentations/presentations.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/presentations/presentations.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/products/dto/product-dto-transform.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/products/dto/product-response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/products/products.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/products/products.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/purchase-orders/dto/purchase-order-response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/purchase-orders/purchase-orders.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/purchase-orders/purchase-orders.service.spec.ts` | MIGRATE | transactional behavior faked with hand-rolled Prisma mocks | Phase 1 |
| `src/sales/dto/sale-response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/sales/sales.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/sales/sales.service.spec.ts` | MIGRATE | transactional behavior faked with hand-rolled Prisma mocks | Phase 1 |
| `src/services/dto/service-dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/services/dto/service-response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/services/services.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/services/services.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/stock/stock.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/stock/stock.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/suppliers/suppliers.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/suppliers/suppliers.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/upload/upload.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/users/users.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/users/users.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/vehicles/validators/plate.validator.spec.ts` | KEEP | pure logic via real decorator/helper | — |
| `src/vehicles/vehicles.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/vehicles/vehicles.service.spec.ts` | KEEP | service business rules vs mocked result, no arg-assertions | — |
| `src/work-orders/dto/work-order-response.dto.spec.ts` | KEEP | DTO validation/serialization via class-transformer | — |
| `src/work-orders/work-orders-consumptions.service.spec.ts` | MIGRATE | transactional behavior faked with hand-rolled Prisma mocks | Phase 1 |
| `src/work-orders/work-orders.controller.spec.ts` | KEEP | guard/roles/delegation, mocked service result | — |
| `src/work-orders/work-orders.service.spec.ts` | MIGRATE | transactional behavior faked with hand-rolled Prisma mocks | Phase 1 |

### test e2e suites (13)

| Path | Bucket | Reason | Exec phase |
|---|---|---|---|
| `test/app.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/cash-closings.e2e-spec.ts` | MIGRATE | period uniqueness + payment sums faked | Phase 1 |
| `test/clients.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/dashboard.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/employees.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/notifications.e2e-spec.ts` | MIGRATE | side effects on transitions faked | Phase 1 |
| `test/products.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/purchase-orders.e2e-spec.ts` | MIGRATE | receive lifecycle + stock movements faked | Phase 1 |
| `test/sales.e2e-spec.ts` | MIGRATE | FIFO stock + compensating movements faked | Phase 1 |
| `test/services.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/users.controller.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/users.e2e-spec.ts` | DELETE | thin mocked e2e, duplicates real-DB integration coverage | Phase 1 (after integration suites green) |
| `test/work-orders.e2e-spec.ts` | MIGRATE | status transitions + order sequence faked | Phase 1 |

## Execution policy

- Phase 1 (Testcontainers) is the replacement provider: all MIGRATE and DELETE items above execute in Phase 1,
  only after `pnpm test:integration` is green.
- MIGRATE unit specs keep their pure-branch assertions; their transactional mocks move to integration suites.
- The `users.e2e` stale assertion is updated, not deleted (behavior verified correct via PR #94).
- Phase 2 (StockService extraction) must run the Phase 1 integration suites before and after the refactor.
