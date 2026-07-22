-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "work_order_id" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_work_order_id_idx" ON "stock_movements"("work_order_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
