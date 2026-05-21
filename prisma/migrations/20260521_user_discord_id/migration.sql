-- Link MileClear users to Discord accounts (Phase 1A of the community
-- engagement roadmap, 21 May 2026). Set via OAuth from the mobile
-- profile screen. Powers Pro Member role auto-sync and future personal
-- slash commands in the MileClear Discord server.
ALTER TABLE `users`
  ADD COLUMN `discordUserId` VARCHAR(32) NULL,
  ADD UNIQUE INDEX `users_discordUserId_key` (`discordUserId`);
