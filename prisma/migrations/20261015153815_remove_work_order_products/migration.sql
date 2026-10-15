/*
  Warnings:

  - You are about to drop the `work_order_products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "work_order_products" DROP CONSTRAINT "work_order_products_product_id_fkey";

-- DropForeignKey
ALTER TABLE "work_order_products" DROP CONSTRAINT "work_order_products_work_order_id_fkey";

-- DropTable
DROP TABLE "work_order_products";
