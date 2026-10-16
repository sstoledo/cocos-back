-- CreateEnum
CREATE TYPE "consumption_type" AS ENUM ('direct', 'partial');

-- CreateEnum
CREATE TYPE "consumption_event_type" AS ENUM ('used', 'opened', 'depleted');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "consumption_type" "consumption_type" NOT NULL DEFAULT 'direct';

-- CreateTable
CREATE TABLE "service_products" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_consumption_events" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "consumption_event_type" NOT NULL,
    "quantity" INTEGER,
    "registered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_consumption_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_products_product_id_idx" ON "service_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_products_service_id_product_id_key" ON "service_products"("service_id", "product_id");

-- CreateIndex
CREATE INDEX "work_order_consumption_events_work_order_id_idx" ON "work_order_consumption_events"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_consumption_events_product_id_idx" ON "work_order_consumption_events"("product_id");

-- AddForeignKey
ALTER TABLE "service_products" ADD CONSTRAINT "service_products_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_products" ADD CONSTRAINT "service_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_consumption_events" ADD CONSTRAINT "work_order_consumption_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_consumption_events" ADD CONSTRAINT "work_order_consumption_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_consumption_events" ADD CONSTRAINT "work_order_consumption_events_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
