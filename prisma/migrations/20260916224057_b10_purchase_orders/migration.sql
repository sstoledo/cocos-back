-- CreateEnum
CREATE TYPE "purchase_order_status" AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "purchase_order_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "purchase_order_id" TEXT;

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "purchase_order_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "purchase_order_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "estimated_total" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "receipt_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_number_sequences" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_purchase_order_number_key" ON "purchase_orders"("purchase_order_number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_is_active_idx" ON "purchase_orders"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_product_id_key" ON "purchase_order_lines"("purchase_order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_sequences_year_key" ON "purchase_order_number_sequences"("year");

-- CreateIndex
CREATE INDEX "lots_purchase_order_id_idx" ON "lots"("purchase_order_id");

-- CreateIndex
CREATE INDEX "stock_movements_purchase_order_id_idx" ON "stock_movements"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
