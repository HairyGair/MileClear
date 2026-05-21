-- Add an optional link from an Invoice to the manual Earning row that
-- represents the same money. Anti-double-count link (Laura Joyce, 21
-- May 2026). Superseded the same day by 20260521_invoice_linked_earning_redirect
-- when we discovered the real case is many earnings → one invoice. This
-- migration ran on prod; the redirect migration removes its column.
ALTER TABLE `invoices`
  ADD COLUMN `linkedEarningId` VARCHAR(36) NULL,
  ADD INDEX `invoices_linkedEarningId_idx` (`linkedEarningId`),
  ADD CONSTRAINT `invoices_linkedEarningId_fkey`
    FOREIGN KEY (`linkedEarningId`) REFERENCES `earnings`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
