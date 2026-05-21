-- Add an optional link from an Invoice to the manual Earning row that
-- represents the same money. When set, the Tax Readiness aggregator
-- counts the invoice and skips the linked earning, so a freelancer
-- who logged income twice (once as a gig-style earning, once as an
-- invoice marked paid) no longer sees their YTD total doubled.
--
-- ON DELETE SET NULL: removing an earning unlinks the invoice rather
-- than cascading. Many invoices may link to the same earning (someone
-- who recorded a quarterly total and later added per-job invoices).
ALTER TABLE `invoices`
  ADD COLUMN `linkedEarningId` VARCHAR(36) NULL,
  ADD INDEX `invoices_linkedEarningId_idx` (`linkedEarningId`),
  ADD CONSTRAINT `invoices_linkedEarningId_fkey`
    FOREIGN KEY (`linkedEarningId`) REFERENCES `earnings`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
