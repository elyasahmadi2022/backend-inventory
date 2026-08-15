-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `effect` ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_permissions` (
    `user_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `effect` ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',

    PRIMARY KEY (`user_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `profile_image_url` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_code_key`(`code`),
    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entity_counters` (
    `key` VARCHAR(191) NOT NULL,
    `current` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `ip_address` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `auth_sessions_user_id_idx`(`user_id`),
    INDEX `auth_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_settings` (
    `id` CHAR(36) NOT NULL,
    `store_name` VARCHAR(191) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `tax_number` VARCHAR(191) NULL,
    `invoice_note` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currencies` (
    `code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `decimal_places` INTEGER NOT NULL DEFAULT 2,
    `is_base` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `id` CHAR(36) NOT NULL,
    `from_currency` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `to_currency` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `effective_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `exchange_rates_from_currency_to_currency_effective_at_idx`(`from_currency`, `to_currency`, `effective_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fiscal_years` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fiscal_years_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fiscal_periods` (
    `id` CHAR(36) NOT NULL,
    `fiscal_year_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `status` ENUM('open', 'locked', 'closed') NOT NULL DEFAULT 'open',

    INDEX `fiscal_periods_starts_on_ends_on_idx`(`starts_on`, `ends_on`),
    UNIQUE INDEX `fiscal_periods_fiscal_year_id_name_key`(`fiscal_year_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
    `type` ENUM('cash', 'bank', 'sarafi', 'daskhil', 'accounts_receivable', 'accounts_payable', 'inventory', 'cost_of_goods_sold', 'sales_revenue', 'purchase', 'expense', 'equity', 'liability', 'exchange_gain', 'exchange_loss', 'other') NOT NULL,
    `normal_balance` ENUM('debit', 'credit') NOT NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NULL,
    `parent_id` CHAR(36) NULL,
    `is_control_account` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accounts_code_key`(`code`),
    INDEX `accounts_category_idx`(`category`),
    INDEX `accounts_type_idx`(`type`),
    INDEX `accounts_currency_code_idx`(`currency_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_balances` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `debit_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `account_balances_currency_code_idx`(`currency_code`),
    UNIQUE INDEX `account_balances_account_id_currency_code_key`(`account_id`, `currency_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partners` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('customer', 'vendor', 'both', 'sarafi', 'staff') NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `receivable_account_id` CHAR(36) NULL,
    `payable_account_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `partners_code_key`(`code`),
    INDEX `partners_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_ledger_accounts` (
    `id` CHAR(36) NOT NULL,
    `partner_id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `type` ENUM('receivable', 'payable', 'advance_received', 'advance_paid', 'deposit') NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,

    INDEX `partner_ledger_accounts_account_id_idx`(`account_id`),
    UNIQUE INDEX `partner_ledger_accounts_partner_id_currency_code_type_key`(`partner_id`, `currency_code`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entries` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `entry_date` DATE NOT NULL,
    `fiscal_period_id` CHAR(36) NULL,
    `description` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'posted', 'reversed', 'voided') NOT NULL DEFAULT 'draft',
    `source_type` ENUM('manual', 'sale', 'purchase', 'payment', 'money_transfer', 'inventory_adjustment', 'opening_balance') NOT NULL DEFAULT 'manual',
    `source_id` VARCHAR(191) NULL,
    `reversal_of_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `posted_by` CHAR(36) NULL,
    `posted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `journal_entries_number_key`(`number`),
    INDEX `journal_entries_entry_date_idx`(`entry_date`),
    INDEX `journal_entries_source_type_source_id_idx`(`source_type`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_lines` (
    `id` CHAR(36) NOT NULL,
    `journal_entry_id` CHAR(36) NOT NULL,
    `line_no` INTEGER NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `partner_id` CHAR(36) NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `base_debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `base_credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `memo` VARCHAR(191) NULL,

    INDEX `journal_lines_account_id_idx`(`account_id`),
    INDEX `journal_lines_partner_id_idx`(`partner_id`),
    UNIQUE INDEX `journal_lines_journal_entry_id_line_no_key`(`journal_entry_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units_of_measure` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `units_of_measure_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `parent_id` CHAR(36) NULL,

    UNIQUE INDEX `product_categories_parent_id_name_key`(`parent_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `category_id` CHAR(36) NULL,
    `base_unit_id` CHAR(36) NOT NULL,
    `preferred_purchase_currency` ENUM('AFN', 'USD', 'PKR') NOT NULL DEFAULT 'USD',
    `preferred_sale_currency` ENUM('AFN', 'USD', 'PKR') NOT NULL DEFAULT 'AFN',
    `standard_cost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `default_sale_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `reorder_level` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    UNIQUE INDEX `products_barcode_key`(`barcode`),
    INDEX `products_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_locations` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('warehouse', 'store', 'shelf', 'in_transit', 'damaged') NOT NULL,
    `parent_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_locations_code_key`(`code`),
    INDEX `inventory_locations_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_balances` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `quantity` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_balances_product_id_location_id_key`(`product_id`, `location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `type` ENUM('opening_stock', 'purchase_receipt', 'sale_issue', 'transfer', 'adjustment_in', 'adjustment_out', 'return_in', 'return_out') NOT NULL,
    `status` ENUM('draft', 'posted', 'cancelled') NOT NULL DEFAULT 'draft',
    `moved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `value_currency_code` ENUM('AFN', 'USD', 'PKR') NULL,
    `total_value` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `journal_entry_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `reference` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_movements_number_key`(`number`),
    INDEX `inventory_movements_type_status_idx`(`type`, `status`),
    INDEX `inventory_movements_moved_at_idx`(`moved_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movement_lines` (
    `id` CHAR(36) NOT NULL,
    `inventory_movement_id` CHAR(36) NOT NULL,
    `line_no` INTEGER NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `from_location_id` CHAR(36) NULL,
    `to_location_id` CHAR(36) NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `unit_cost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `line_value` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    INDEX `inventory_movement_lines_product_id_idx`(`product_id`),
    INDEX `inventory_movement_lines_from_location_id_idx`(`from_location_id`),
    INDEX `inventory_movement_lines_to_location_id_idx`(`to_location_id`),
    UNIQUE INDEX `inventory_movement_lines_inventory_movement_id_line_no_key`(`inventory_movement_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_invoices` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `customer_id` CHAR(36) NOT NULL,
    `customer_ledger_account_id` CHAR(36) NOT NULL,
    `revenue_account_id` CHAR(36) NOT NULL,
    `inventory_account_id` CHAR(36) NOT NULL,
    `cogs_account_id` CHAR(36) NOT NULL,
    `invoice_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `status` ENUM('draft', 'posted', 'partially_paid', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tax_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paid_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `journal_entry_id` CHAR(36) NULL,
    `inventory_movement_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_invoices_number_key`(`number`),
    INDEX `sales_invoices_customer_id_idx`(`customer_id`),
    INDEX `sales_invoices_customer_ledger_account_id_idx`(`customer_ledger_account_id`),
    INDEX `sales_invoices_invoice_date_idx`(`invoice_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_invoice_lines` (
    `id` CHAR(36) NOT NULL,
    `sales_invoice_id` CHAR(36) NOT NULL,
    `line_no` INTEGER NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NULL,
    `description` VARCHAR(191) NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `unit_price` DECIMAL(18, 2) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(18, 2) NOT NULL,
    `cost_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    INDEX `sales_invoice_lines_product_id_idx`(`product_id`),
    UNIQUE INDEX `sales_invoice_lines_sales_invoice_id_line_no_key`(`sales_invoice_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_bills` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `vendor_id` CHAR(36) NOT NULL,
    `vendor_ledger_account_id` CHAR(36) NOT NULL,
    `inventory_account_id` CHAR(36) NOT NULL,
    `expense_account_id` CHAR(36) NULL,
    `bill_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `status` ENUM('draft', 'posted', 'partially_paid', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tax_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paid_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `journal_entry_id` CHAR(36) NULL,
    `inventory_movement_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_bills_number_key`(`number`),
    INDEX `purchase_bills_vendor_id_idx`(`vendor_id`),
    INDEX `purchase_bills_vendor_ledger_account_id_idx`(`vendor_ledger_account_id`),
    INDEX `purchase_bills_bill_date_idx`(`bill_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_bill_lines` (
    `id` CHAR(36) NOT NULL,
    `purchase_bill_id` CHAR(36) NOT NULL,
    `line_no` INTEGER NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NULL,
    `description` VARCHAR(191) NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `unit_cost` DECIMAL(18, 2) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(18, 2) NOT NULL,

    INDEX `purchase_bill_lines_product_id_idx`(`product_id`),
    UNIQUE INDEX `purchase_bill_lines_purchase_bill_id_line_no_key`(`purchase_bill_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `direction` ENUM('receive', 'pay') NOT NULL,
    `partner_id` CHAR(36) NULL,
    `sales_invoice_id` CHAR(36) NULL,
    `purchase_bill_id` CHAR(36) NULL,
    `from_account_id` CHAR(36) NOT NULL,
    `to_account_id` CHAR(36) NOT NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `amount` DECIMAL(18, 2) NOT NULL,
    `payment_date` DATE NOT NULL,
    `journal_entry_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payments_number_key`(`number`),
    INDEX `payments_partner_id_idx`(`partner_id`),
    INDEX `payments_payment_date_idx`(`payment_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `money_transfers` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'posted', 'cancelled') NOT NULL DEFAULT 'draft',
    `transfer_date` DATE NOT NULL,
    `from_account_id` CHAR(36) NOT NULL,
    `to_account_id` CHAR(36) NOT NULL,
    `currency_code` ENUM('AFN', 'USD', 'PKR') NOT NULL,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `amount` DECIMAL(18, 2) NOT NULL,
    `fee_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `journal_entry_id` CHAR(36) NULL,
    `created_by` CHAR(36) NULL,
    `reference` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `money_transfers_number_key`(`number`),
    INDEX `money_transfers_transfer_date_idx`(`transfer_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_from_currency_fkey` FOREIGN KEY (`from_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_to_currency_fkey` FOREIGN KEY (`to_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fiscal_periods` ADD CONSTRAINT `fiscal_periods_fiscal_year_id_fkey` FOREIGN KEY (`fiscal_year_id`) REFERENCES `fiscal_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_balances` ADD CONSTRAINT `account_balances_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_balances` ADD CONSTRAINT `account_balances_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partners` ADD CONSTRAINT `partners_receivable_account_id_fkey` FOREIGN KEY (`receivable_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partners` ADD CONSTRAINT `partners_payable_account_id_fkey` FOREIGN KEY (`payable_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_ledger_accounts` ADD CONSTRAINT `partner_ledger_accounts_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_ledger_accounts` ADD CONSTRAINT `partner_ledger_accounts_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_ledger_accounts` ADD CONSTRAINT `partner_ledger_accounts_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_fiscal_period_id_fkey` FOREIGN KEY (`fiscal_period_id`) REFERENCES `fiscal_periods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_reversal_of_id_fkey` FOREIGN KEY (`reversal_of_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_posted_by_fkey` FOREIGN KEY (`posted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_base_unit_id_fkey` FOREIGN KEY (`base_unit_id`) REFERENCES `units_of_measure`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_preferred_purchase_currency_fkey` FOREIGN KEY (`preferred_purchase_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_preferred_sale_currency_fkey` FOREIGN KEY (`preferred_sale_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_locations` ADD CONSTRAINT `inventory_locations_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `inventory_locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_value_currency_code_fkey` FOREIGN KEY (`value_currency_code`) REFERENCES `currencies`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movement_lines` ADD CONSTRAINT `inventory_movement_lines_inventory_movement_id_fkey` FOREIGN KEY (`inventory_movement_id`) REFERENCES `inventory_movements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movement_lines` ADD CONSTRAINT `inventory_movement_lines_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movement_lines` ADD CONSTRAINT `inventory_movement_lines_from_location_id_fkey` FOREIGN KEY (`from_location_id`) REFERENCES `inventory_locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movement_lines` ADD CONSTRAINT `inventory_movement_lines_to_location_id_fkey` FOREIGN KEY (`to_location_id`) REFERENCES `inventory_locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_customer_ledger_account_id_fkey` FOREIGN KEY (`customer_ledger_account_id`) REFERENCES `partner_ledger_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_revenue_account_id_fkey` FOREIGN KEY (`revenue_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_inventory_account_id_fkey` FOREIGN KEY (`inventory_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_cogs_account_id_fkey` FOREIGN KEY (`cogs_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_inventory_movement_id_fkey` FOREIGN KEY (`inventory_movement_id`) REFERENCES `inventory_movements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoice_lines` ADD CONSTRAINT `sales_invoice_lines_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoice_lines` ADD CONSTRAINT `sales_invoice_lines_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoice_lines` ADD CONSTRAINT `sales_invoice_lines_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_vendor_ledger_account_id_fkey` FOREIGN KEY (`vendor_ledger_account_id`) REFERENCES `partner_ledger_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_inventory_account_id_fkey` FOREIGN KEY (`inventory_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_expense_account_id_fkey` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_inventory_movement_id_fkey` FOREIGN KEY (`inventory_movement_id`) REFERENCES `inventory_movements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bill_lines` ADD CONSTRAINT `purchase_bill_lines_purchase_bill_id_fkey` FOREIGN KEY (`purchase_bill_id`) REFERENCES `purchase_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bill_lines` ADD CONSTRAINT `purchase_bill_lines_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bill_lines` ADD CONSTRAINT `purchase_bill_lines_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_purchase_bill_id_fkey` FOREIGN KEY (`purchase_bill_id`) REFERENCES `purchase_bills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_from_account_id_fkey` FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_to_account_id_fkey` FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `money_transfers` ADD CONSTRAINT `money_transfers_from_account_id_fkey` FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `money_transfers` ADD CONSTRAINT `money_transfers_to_account_id_fkey` FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `money_transfers` ADD CONSTRAINT `money_transfers_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `money_transfers` ADD CONSTRAINT `money_transfers_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `money_transfers` ADD CONSTRAINT `money_transfers_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
