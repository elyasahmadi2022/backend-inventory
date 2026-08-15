-- Add optional email now so existing users keep working.
-- New API requests require email, and this can become NOT NULL after old users are backfilled.
ALTER TABLE "users" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
