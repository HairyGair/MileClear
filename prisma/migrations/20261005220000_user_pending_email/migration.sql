-- Email changes wait for their code (5 Oct 2026). The new address sits in
-- pendingEmail until confirmed; sign-in stays on `email` until then.
-- Nullable column: nothing changes for any existing account.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `pendingEmail` VARCHAR(191) NULL;
