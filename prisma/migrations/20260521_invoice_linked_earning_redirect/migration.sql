-- Same-day follow-up to 20260521_invoice_linked_earning. We initially
-- put the FK on invoices (linkedEarningId, one invoice → one earning)
-- and immediately discovered Laura's real-world case: 7 daily £57.14
-- earnings rolling up to a single £400 invoice. That's many earnings
-- → one invoice — and the FK direction won't express it.
--
-- This migration moves the link to the earnings side. No data loss:
-- the original column was deployed but never written to before the
-- redirect.
ALTER TABLE `invoices`
  DROP FOREIGN KEY `invoices_linkedEarningId_fkey`,
  DROP INDEX `invoices_linkedEarningId_idx`,
  DROP COLUMN `linkedEarningId`;

ALTER TABLE `earnings`
  ADD COLUMN `replacedByInvoiceId` VARCHAR(36) NULL,
  ADD INDEX `earnings_replacedByInvoiceId_idx` (`replacedByInvoiceId`),
  ADD CONSTRAINT `earnings_replacedByInvoiceId_fkey`
    FOREIGN KEY (`replacedByInvoiceId`) REFERENCES `invoices`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
