# B13 — Cash Closing (Cierre de Caja) — LAST BACKEND UNIT

## Objective
Daily cash reconciliation: close a period, snapshot expected totals by payment method vs declared counted cash, record the difference. Immutable audit trail. F12 builds the UI + PDF on this contract.

## Problem / Why
No cash/closing/register concept exists. Sales exist with single paymentMethod, completed|cancelled status. A shop needs to reconcile the drawer daily — the core LatAm POS ritual.

## Scope (maintainer decision 2026-09-23): Option A — minimal snapshot
- Chained periods: periodStart = last closing's periodEnd (or open-period start if none); sales after a closing belong to the NEXT closing automatically
- Snapshot at close: expectedCash/Card/Transfer + salesCount + declaredCash + difference — IMMUTABLE, never recomputed
- NO isActive/deletedAt on CashClosing (audit trail — deliberate deviation from soft-delete convention)
- NO branches/shifts (single-shop; Sale.branchId stays nullable — follow-up if ever needed)
- NO cash movements/petty cash (follow-up)
- PDF is F12's concern — B13 provides data only

## Binding constraints
- SAL-NF4: totals count ONLY `status='completed'` + `isActive=true` sales (cancelled never enter totals)
- Money = decimal strings end-to-end (repo convention; B10 precedent — watch the @Min-on-string bug B10 e2e caught)
- RolesGuard: explicit @Roles ALWAYS (no metadata = anonymous access)
- Period bounds: server-local TZ (same documented limitation as B12)

## Contract
- `POST /cash-closings` — body { declaredCash: string (decimal >= 0), notes?: string }. Server: in transaction, find last closing (periodStart = its periodEnd, else open), aggregate sales completed+isActive in [periodStart, now) groupBy paymentMethod, snapshot, difference = declaredCash - expectedCash, create. 409 CLOSING_CONFLICT on concurrent close (@@unique([periodStart]) → map P2002). Roles: Admin+Reception (proposed default).
- `GET /cash-closings/preview` — expected totals + salesCount + periodStart for the CURRENT open period (nothing persisted). Roles: Admin+Reception.
- `GET /cash-closings?page&limit` — list, {data, meta}, newest first (periodEnd desc). Roles: Admin+Reception.
- `GET /cash-closings/:id` — detail. 404 CASH_CLOSING_NOT_FOUND. Roles: Admin+Reception.
- Response DTO: { id, periodStart, periodEnd, expectedCash, expectedCard, expectedTransfer, declaredCash, difference, salesCount, notes, createdAt, closedBy:{id,name} } — decimals as strings.
- Empty period (zero sales) is ALLOWED — closing records zeros + declared.

## Model
CashClosing: id uuid, closedById FK→User, periodStart, periodEnd, expectedCash/Card/Transfer/declaredCash/difference Decimal(10,2), salesCount Int, notes String?, createdAt. @@unique([periodStart]), @@index([periodEnd]).

## Tasks
- [x] B13.1 Schema + migration → commit 61be4ca on feat/b13-1-schema, 51 lines, 469/469 green, PG16-verified. onDelete=Restrict (audit: user deletion blocked if they have closings). Extra @@index([closedById]) (unindexed FK lock amplification). PR #75 OPEN.
- [x] B13.2 Module + POST close + GET preview + unit specs → commit a4b9dfb on feat/b13-2-close, 837 lines, 504/504 (35 new), e2e intact. Shared aggregatePeriod helper (single source), pure Decimal math (0.3-0.1='0.20' float-guard test), P2002→409 CLOSING_CONFLICT, first-closing-no-sales periodStart=now. PR #76 OPEN (exception 837).
- [x] B13.3 GET list + detail + unit specs → commit 3ee66e9 on feat/b13-3-list, 227 lines, 514/514 (10 new), e2e intact. Route order verified (preview before :id). PR #77 OPEN.
- [x] B13.4 E2E suite → commit 5b8750f on feat/b13-4-e2e, 565 lines, 196/196 e2e (25 new) + 514/514 unit. Roles matrix 4 endpoints × 7 cases, SAL-NF4 exclusion asserted, chained periods, 409 race, validation, preview-no-persist, list/detail. Gotcha: pinned clock vs seeded periodEnd → spurious 409 (fix: seed ends before NOW).

## Acceptance Criteria
- Close snapshots exact completed-only totals; concurrent close → one wins, one 409
- Preview shows open period without persisting
- List/detail newest-first, paginated; decimals as strings
- ReadOnly/Mechanic/Purchasing/Warehouse → 403 on all 4; anon → 401
- Full suite green (baseline 469 unit / 171 e2e)

## Checks
- Strict TDD. Per-commit gate: assess (untracked-inventory sha256:21682c85...) — medium → self-verification + spot check. 4 stacked PRs, ask before merge.

## Progress
(started 2026-09-23)

## Next step
FEATURE CLOSED 2026-09-23 — chain #75→#78 merged to main @ 84dcdcf (9835bae, 6d9cbfa, 817c2b7, 84dcdcf), 514/514 unit + 196/196 e2e green on main, zero conflicts, branches cleaned. **Backend B1–B13 COMPLETE.** Roadmap #16 updated → 24/25. F12 consumes this contract (see mirror obs #1292).