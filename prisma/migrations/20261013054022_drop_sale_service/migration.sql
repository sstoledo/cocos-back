/*
  Warnings:

  - You are about to drop the `sale_services` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "sale_services" DROP CONSTRAINT "sale_services_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_services" DROP CONSTRAINT "sale_services_service_id_fkey";

-- DropTable
DROP TABLE "sale_services";
