-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "estimated_duration" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");

-- CreateIndex
CREATE INDEX "services_code_idx" ON "services"("code");

-- CreateIndex
CREATE INDEX "services_name_idx" ON "services"("name");

-- CreateIndex
CREATE INDEX "services_is_active_idx" ON "services"("is_active");
