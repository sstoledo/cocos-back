-- CreateTable
CREATE TABLE "fiscal_number_sequences" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fiscal_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_number_sequences_serie_key" ON "fiscal_number_sequences"("serie");
