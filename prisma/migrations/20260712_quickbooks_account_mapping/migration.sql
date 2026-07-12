-- Account mapping for QuickBooks Purchase-based sync.
ALTER TABLE `quickbooks_connections`
  ADD COLUMN `expenseAccountId` VARCHAR(64) NULL,
  ADD COLUMN `payFromAccountId` VARCHAR(64) NULL;
