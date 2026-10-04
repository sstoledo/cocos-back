# B12 — Dashboard Summary Endpoints

## Objective
Provide KPI counters for the dashboard page (cocos-web side is currently a stub, F11 will wire it). One aggregation endpoint, no money, safe for every role.

## Problem / Why
The web dashboard promises 3 StatCards (Resumen del día, Órdenes pendientes, Ventas del mes) + recent activity, all stubbed with `[]`. Backend has ZERO aggregation endpoints today. F11 needs a contract to consume.

## Scope (maintainer decision 2026-09-23)
- KPIs **sin plata** (counts only), visible to ALL 6 roles — matches ReadOnly already seeing every catalog; NO widening of sales/PO role gates
- Metrics: sales completed today (count), sales completed this month (count), work orders by status, purchase orders by status, unread notifications (current user), generatedAt
- Recent-activity feed: NOT in v1 (different shape; F11 may drop or stub the card) — follow-up
- Low-stock: NOT in v1 (Product.minStock removed, no expirationDate index) — follow-up
- Money (revenue, WO totals): follow-up via role-scoped endpoint or F12 cash closing

## Constraints / Decisions
- New `src/dashboard/` module registered in app.module.ts
- `GET /api/dashboard/summary`, no query params in v1 (cards are fixed "today"/"this month" windows, no date picker)
- Date bounds: server-local TZ (startOfToday / startOfMonth via new Date); **documented limitation: backend has zero TZ awareness — follow-up is a shop-TZ config** (consistent with all createdAt-based lists today)
- Response DTO (camelCase keys, all numbers):
  ```json
  {
    "salesTodayCount": 12,
    "salesMonthCount": 87,
    "workOrders": { "pending": 4, "inProgress": 2, "done": 6, "cancelled": 1 },
    "purchaseOrders": { "draft": 1, "ordered": 3, "partiallyReceived": 2, "received": 5, "cancelled": 1 },
    "notificationsUnread": 3,
    "generatedAt": "2026-09-30T14:00:00.000Z"
  }
  ```
- Roles: explicit `@Roles` with ALL 6 (RolesGuard returns true without metadata → anonymous access; B11 precedent)
- Soft-delete convention: `isActive: true` in every where (Lot/SaleProduct have neither field — not used here)
- Money excluded → no Decimal handling; plain numbers
- Status counts via Prisma `groupBy` (first in codebase) OR parallel counts — pick what matches repo style, justify

## Deliverables / Tasks
- [x] B12.1 Module + summary endpoint + unit specs → commit 76714b4 on feat/b12-1-summary, 726 lines, 469/469 (24 new), mutation-tested 9/9, e2e intact. groupBy decision (2 RTs vs 9), zero-filled buckets, exhaustive enum typing, single clock capture (now threaded to windows+generatedAt — midnight-rollover bug avoided). TZ discovery: machine is America/Lima UTC-5, specs use fake timers + local Date ctor.
- [x] B12.2 E2E suite → commit a0463c2 on feat/b12-2-e2e, 519 lines, 171/171 e2e (23 new) + 469/469 unit. NOTE: task got cancelled mid-flight AFTER writing the spec — salvaged uncommitted, formatted (check:fix), verified full gate, committed by orchestrator. 1 file only, no changes to other specs' mocks needed.

## Acceptance Criteria
- GET /api/dashboard/summary returns the DTO shape above for every authenticated role including ReadOnly
- Sales counts include ONLY status=completed, isActive=true
- WorkOrder/PO counts bucket every enum member exactly once
- notificationsUnread is the caller's own unread only
- 401 for unauthenticated
- Full suite green: pnpm check, pnpm test (baseline 445), pnpm test:e2e (baseline 148), pnpm build

## Checks
- strict TDD (cocos-back): RED → GREEN → REFACTOR per task
- After each work-unit commit, ODD verification gate: `gentle-ai review assess --cwd cocos-back --base-ref <prev> --untracked-scope=exclude --expected-untracked-inventory=sha256:ee393436bd... --json` — medium → writer self-verification + parent spot check (rerun focused tests)
- Delivery: 2 stacked PRs (ask before merge) — feat/b12-1-summary → main, feat/b12-2-e2e → b12-1; squ

## Progress / Verdict
(updated as tasks complete)

## Next step
FEATURE CLOSED 2026-09-23 — chain #73→#74 merged to main @ ea579fc (14b90c7, ea579fc), 469/469 unit + 171/171 e2e green on main, zero conflicts, branches cleaned. Roadmap #16 updated → 23/25.