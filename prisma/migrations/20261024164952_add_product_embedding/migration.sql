-- Enable pgvector and add the product embedding column (F6).
-- Dimension 768 matches the truncated (Matryoshka) gemini-embedding-2
-- output requested at write time; changing it requires a full re-embed.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "products" ADD COLUMN "embedding" vector(768);
