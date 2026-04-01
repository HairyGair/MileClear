-- AlterTable
ALTER TABLE `feedback` ADD COLUMN `isKnownIssue` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `knownIssueStatus` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `feedback_isKnownIssue_idx` ON `feedback`(`isKnownIssue`);
