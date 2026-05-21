-- QuickBooks Online mileage export (21 May 2026, Phase B).
-- Caches the mapping from a MileClear Vehicle to its corresponding QBO
-- Vehicle entity so subsequent syncs don't have to re-query QBO's
-- Vehicle list. Created opportunistically by the first mileage push
-- that references a given vehicle.

CREATE TABLE `quickbooks_synced_vehicles` (
  `id`            VARCHAR(191) NOT NULL,
  `connectionId`  VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `vehicleId`     VARCHAR(191) NOT NULL,
  `qboEntityId`   VARCHAR(64)  NOT NULL,
  `syncedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `quickbooks_synced_vehicles_userId_vehicleId_key` (`userId`,`vehicleId`),
  INDEX  `quickbooks_synced_vehicles_connectionId_idx` (`connectionId`),

  CONSTRAINT `quickbooks_synced_vehicles_connectionId_fkey`
    FOREIGN KEY (`connectionId`) REFERENCES `quickbooks_connections`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
