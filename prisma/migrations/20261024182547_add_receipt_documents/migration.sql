-- Supplier receipt documents for OCR ingestion (F7). A document starts
-- pending, holds the Cloudinary file plus the structured Gemini extraction,
-- and links the Lot it created when the user confirms it (lot mode or
-- purchase-order receive mode).
CREATE TYPE "receipt_document_status" AS ENUM ('pending', 'confirmed', 'discarded');

CREATE TABLE "receipt_documents" (
    "id" TEXT NOT NULL,
    "status" "receipt_document_status" NOT NULL DEFAULT 'pending',
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_public_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "extracted" JSONB,
    "ocr_model" TEXT,
    "ocr_payload" JSONB,
    "lot_id" TEXT,
    "purchase_order_id" TEXT,
    "supplier_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipt_documents_lot_id_key" ON "receipt_documents"("lot_id");
CREATE INDEX "receipt_documents_status_idx" ON "receipt_documents"("status");
CREATE INDEX "receipt_documents_supplier_id_idx" ON "receipt_documents"("supplier_id");
CREATE INDEX "receipt_documents_purchase_order_id_idx" ON "receipt_documents"("purchase_order_id");

ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
