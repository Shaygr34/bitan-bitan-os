-- Delete duplicate sources (keep the oldest by createdAt for each url)
DELETE FROM "sources"
WHERE id NOT IN (
  SELECT DISTINCT ON (url) id
  FROM "sources"
  ORDER BY url, "createdAt" ASC
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");
