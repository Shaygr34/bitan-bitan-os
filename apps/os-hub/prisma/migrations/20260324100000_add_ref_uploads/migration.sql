-- CreateTable
CREATE TABLE "ref_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "textContent" TEXT,
    "url" TEXT,
    "articleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ref_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ref_uploads_articleId_idx" ON "ref_uploads"("articleId");

-- AddForeignKey
ALTER TABLE "ref_uploads" ADD CONSTRAINT "ref_uploads_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
