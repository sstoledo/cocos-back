-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "ruc" TEXT,
    "legal_name" TEXT,
    "address" TEXT,
    "factura_series" TEXT NOT NULL DEFAULT 'F001',
    "boleta_series" TEXT NOT NULL DEFAULT 'B001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);
