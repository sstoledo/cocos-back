-- CreateEnum
CREATE TYPE "proforma_status" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'converted');

-- CreateTable
CREATE TABLE "proformas" (
    "id" TEXT NOT NULL,
    "proforma_number" TEXT NOT NULL,
    "client_id" TEXT,
    "branch_id" TEXT,
    "employee_id" TEXT,
    "status" "proforma_status" NOT NULL DEFAULT 'draft',
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "converted_sale_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proformas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_products" (
    "id" TEXT NOT NULL,
    "proforma_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_number_sequences" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proformas_proforma_number_key" ON "proformas"("proforma_number");

-- CreateIndex
CREATE UNIQUE INDEX "proformas_converted_sale_id_key" ON "proformas"("converted_sale_id");

-- CreateIndex
CREATE INDEX "proformas_client_id_idx" ON "proformas"("client_id");

-- CreateIndex
CREATE INDEX "proformas_branch_id_idx" ON "proformas"("branch_id");

-- CreateIndex
CREATE INDEX "proformas_employee_id_idx" ON "proformas"("employee_id");

-- CreateIndex
CREATE INDEX "proformas_status_idx" ON "proformas"("status");

-- CreateIndex
CREATE INDEX "proformas_is_active_idx" ON "proformas"("is_active");

-- CreateIndex
CREATE INDEX "proformas_created_at_idx" ON "proformas"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_products_proforma_id_product_id_key" ON "proforma_products"("proforma_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_number_sequences_year_key" ON "proforma_number_sequences"("year");

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_converted_sale_id_fkey" FOREIGN KEY ("converted_sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_products" ADD CONSTRAINT "proforma_products_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_products" ADD CONSTRAINT "proforma_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
