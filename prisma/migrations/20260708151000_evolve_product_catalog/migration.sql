-- CreateTable
CREATE TABLE "presentations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presentations_name_key" ON "presentations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- Insert default catalog rows so existing products can be migrated safely
INSERT INTO "presentations" ("id", "name") VALUES ('default_presentation', 'Unidad');
INSERT INTO "brands" ("id", "name") VALUES ('default_brand', 'Genérica');
INSERT INTO "categories" ("id", "name") VALUES ('default_category', 'General');

-- AlterTable
ALTER TABLE "products" DROP COLUMN "unit",
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand_id" TEXT,
ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "presentation_id" TEXT,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- Backfill existing products with the default catalog rows
UPDATE "products" SET "presentation_id" = 'default_presentation',
                      "brand_id" = 'default_brand',
                      "category_id" = 'default_category';

-- Make the new FK columns non-nullable now that every row has a value
ALTER TABLE "products" ALTER COLUMN "brand_id" SET NOT NULL,
ALTER COLUMN "category_id" SET NOT NULL,
ALTER COLUMN "presentation_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
