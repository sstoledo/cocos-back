-- CreateTable
CREATE TABLE "cash_closings" (
    "id" TEXT NOT NULL,
    "closed_by_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "expected_cash" DECIMAL(10,2) NOT NULL,
    "expected_card" DECIMAL(10,2) NOT NULL,
    "expected_transfer" DECIMAL(10,2) NOT NULL,
    "declared_cash" DECIMAL(10,2) NOT NULL,
    "difference" DECIMAL(10,2) NOT NULL,
    "sales_count" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_closings_period_end_idx" ON "cash_closings"("period_end");

-- CreateIndex
CREATE INDEX "cash_closings_closed_by_id_idx" ON "cash_closings"("closed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closings_period_start_key" ON "cash_closings"("period_start");

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
