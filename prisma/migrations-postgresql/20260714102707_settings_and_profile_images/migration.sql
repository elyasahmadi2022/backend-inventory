-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profile_image_url" TEXT;

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL,
    "store_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "website" TEXT,
    "tax_number" TEXT,
    "invoice_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);
