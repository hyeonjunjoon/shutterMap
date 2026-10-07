-- DropIndex
DROP INDEX "User_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_email_key" ON "User"("provider", "email");
