-- Accountant details on users. Laura Joyce request 11 May 2026:
-- her accountant fee is a known fixed annual cost; she wants the
-- weekly set-aside guidance to include it ("set aside her fee
-- also"). All three columns optional - users without an accountant
-- skip the section.
ALTER TABLE `users`
    ADD COLUMN `accountantName` VARCHAR(120) NULL,
    ADD COLUMN `accountantContact` VARCHAR(255) NULL,
    ADD COLUMN `accountantAnnualFeePence` INT NULL;
