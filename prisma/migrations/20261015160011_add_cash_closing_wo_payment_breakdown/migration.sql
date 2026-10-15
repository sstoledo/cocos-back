-- AlterTable
ALTER TABLE "cash_closings" ADD COLUMN     "work_order_payments_card" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "work_order_payments_cash" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "work_order_payments_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "work_order_payments_transfer" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
