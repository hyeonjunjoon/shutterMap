CREATE INDEX "photo_location_gist_idx" ON "Photo" USING GIST (location)
WHERE "visibility" <> 'HIDDEN' AND "status" = 'ACTIVE' AND location IS NOT NULL;