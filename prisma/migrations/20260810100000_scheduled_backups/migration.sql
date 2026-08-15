ALTER TABLE `store_settings`
  ADD COLUMN `backup_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `backup_frequency` VARCHAR(191) NOT NULL DEFAULT 'daily',
  ADD COLUMN `backup_path` VARCHAR(191) NOT NULL DEFAULT 'automatic',
  ADD COLUMN `backup_last_run_at` DATETIME(3) NULL,
  ADD COLUMN `backup_next_run_at` DATETIME(3) NULL,
  ADD COLUMN `backup_last_filename` VARCHAR(191) NULL,
  ADD COLUMN `backup_last_error` TEXT NULL;
