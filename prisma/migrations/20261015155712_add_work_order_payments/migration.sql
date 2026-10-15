-- CreateTable
CREATE TABLE "work_order_payments" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" "payment_methods" NOT NULL,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_payments_work_order_id_idx" ON "work_order_payments"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_payments_paid_at_idx" ON "work_order_payments"("paid_at");

-- AddForeignKey
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
