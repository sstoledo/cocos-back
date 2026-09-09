-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('completed', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_methods" AS ENUM ('cash', 'card', 'transfer');

-- AlterEnum
ALTER TYPE "stock_movement_types" ADD VALUE 'sale';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "sale_id" TEXT;

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "sale_number" TEXT NOT NULL,
    "client_id" TEXT,
    "branch_id" TEXT,
    "employee_id" TEXT,
    "status" "sale_status" NOT NULL DEFAULT 'completed',
    "payment_method" "payment_methods" NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_products" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_services" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_number_sequences" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");

-- CreateIndex
CREATE INDEX "sales_client_id_idx" ON "sales"("client_id");

-- CreateIndex
CREATE INDEX "sales_branch_id_idx" ON "sales"("branch_id");

-- CreateIndex
CREATE INDEX "sales_employee_id_idx" ON "sales"("employee_id");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_is_active_idx" ON "sales"("is_active");

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_products_sale_id_product_id_key" ON "sale_products"("sale_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_services_sale_id_service_id_key" ON "sale_services"("sale_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_number_sequences_year_key" ON "sale_number_sequences"("year");

-- CreateIndex
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements"("sale_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_services" ADD CONSTRAINT "sale_services_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_services" ADD CONSTRAINT "sale_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
