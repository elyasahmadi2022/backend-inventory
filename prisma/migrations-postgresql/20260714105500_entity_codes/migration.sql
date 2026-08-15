CREATE TABLE "entity_counters" (
  "key" TEXT NOT NULL,
  "current" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entity_counters_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "users" ADD COLUMN "code" TEXT;

WITH numbered_users AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS row_number
  FROM "users"
)
UPDATE "users"
SET "code" = 'USR-' || LPAD(numbered_users.row_number::TEXT, 6, '0')
FROM numbered_users
WHERE "users"."id" = numbered_users."id";

CREATE UNIQUE INDEX "users_code_key" ON "users"("code");

INSERT INTO "entity_counters" ("key", "current")
VALUES
  ('user', COALESCE((SELECT COUNT(*) FROM "users"), 0)),
  ('account', COALESCE((SELECT COUNT(*) FROM "accounts"), 0)),
  ('product', COALESCE((SELECT COUNT(*) FROM "products"), 0)),
  ('customer', COALESCE((SELECT COUNT(*) FROM "partners" WHERE "type" = 'customer'), 0)),
  ('vendor', COALESCE((SELECT COUNT(*) FROM "partners" WHERE "type" = 'vendor'), 0)),
  ('partner', COALESCE((SELECT COUNT(*) FROM "partners" WHERE "type" = 'both'), 0)),
  ('sarafi', COALESCE((SELECT COUNT(*) FROM "partners" WHERE "type" = 'sarafi'), 0)),
  ('staff', COALESCE((SELECT COUNT(*) FROM "partners" WHERE "type" = 'staff'), 0)),
  ('transfer', COALESCE((SELECT COUNT(*) FROM "money_transfers"), 0)),
  ('journal', COALESCE((SELECT COUNT(*) FROM "journal_entries"), 0));
