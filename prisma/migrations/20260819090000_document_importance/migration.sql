ALTER TABLE `sales_invoices`
  ADD COLUMN `is_important` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `purchase_bills`
  ADD COLUMN `is_important` BOOLEAN NOT NULL DEFAULT false;
