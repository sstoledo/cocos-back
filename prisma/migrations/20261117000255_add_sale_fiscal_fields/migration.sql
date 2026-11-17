-- CreateEnum
CREATE TYPE "fiscal_document_type" AS ENUM ('factura', 'boleta');

-- CreateEnum
CREATE TYPE "sunat_emission_status" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "documentType" "fiscal_document_type",
ADD COLUMN     "fiscal_number" INTEGER,
ADD COLUMN     "fiscal_series" TEXT,
ADD COLUMN     "sunat_status" "sunat_emission_status" NOT NULL DEFAULT 'pending';
