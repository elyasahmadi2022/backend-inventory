ALTER TABLE `money_transfers`
  ADD COLUMN `destination_currency_code` ENUM('AFN', 'USD', 'PKR') NULL,
  ADD COLUMN `destination_amount` DECIMAL(18, 2) NULL,
  ADD COLUMN `conversion_rate` DECIMAL(18, 8) NULL;

UPDATE `money_transfers`
SET
  `destination_currency_code` = `currency_code`,
  `destination_amount` = `amount`,
  `conversion_rate` = 1
WHERE `destination_currency_code` IS NULL;
