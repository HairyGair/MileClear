-- QuickBooks Online integration (21 May 2026, Phase A foundation).
-- Pro-only export feature; sandbox-first until Intuit accreditation.
-- Tokens are AES-256-GCM-encrypted at the application layer.

CREATE TABLE `quickbooks_connections` (
  `id`                     VARCHAR(191) NOT NULL,
  `userId`                 VARCHAR(191) NOT NULL,
  `realmId`                VARCHAR(64)  NOT NULL,
  `accessTokenEncrypted`   TEXT         NOT NULL,
  `refreshTokenEncrypted`  TEXT         NOT NULL,
  `tokenExpiresAt`         DATETIME(3)  NOT NULL,
  `environment`            VARCHAR(16)  NOT NULL DEFAULT 'sandbox',
  `companyName`            VARCHAR(200) NULL,
  `lastSyncedAt`           DATETIME(3)  NULL,
  `status`                 VARCHAR(20)  NOT NULL DEFAULT 'active',
  `createdAt`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`              DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `quickbooks_connections_userId_key` (`userId`),
  INDEX  `quickbooks_connections_userId_idx` (`userId`),

  CONSTRAINT `quickbooks_connections_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quickbooks_synced_trips` (
  `id`            VARCHAR(191) NOT NULL,
  `connectionId`  VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `tripId`        VARCHAR(191) NOT NULL,
  `qboEntityId`   VARCHAR(64)  NOT NULL,
  `qboEntityType` VARCHAR(40)  NOT NULL DEFAULT 'VehicleMileage',
  `syncedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `quickbooks_synced_trips_userId_tripId_key` (`userId`,`tripId`),
  INDEX  `quickbooks_synced_trips_connectionId_idx` (`connectionId`),

  CONSTRAINT `quickbooks_synced_trips_connectionId_fkey`
    FOREIGN KEY (`connectionId`) REFERENCES `quickbooks_connections`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quickbooks_synced_earnings` (
  `id`            VARCHAR(191) NOT NULL,
  `connectionId`  VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `earningId`     VARCHAR(191) NOT NULL,
  `qboEntityId`   VARCHAR(64)  NOT NULL,
  `qboEntityType` VARCHAR(40)  NOT NULL DEFAULT 'SalesReceipt',
  `syncedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `quickbooks_synced_earnings_userId_earningId_key` (`userId`,`earningId`),
  INDEX  `quickbooks_synced_earnings_connectionId_idx` (`connectionId`),

  CONSTRAINT `quickbooks_synced_earnings_connectionId_fkey`
    FOREIGN KEY (`connectionId`) REFERENCES `quickbooks_connections`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quickbooks_synced_expenses` (
  `id`            VARCHAR(191) NOT NULL,
  `connectionId`  VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `expenseId`     VARCHAR(191) NOT NULL,
  `qboEntityId`   VARCHAR(64)  NOT NULL,
  `qboEntityType` VARCHAR(40)  NOT NULL DEFAULT 'Purchase',
  `syncedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `quickbooks_synced_expenses_userId_expenseId_key` (`userId`,`expenseId`),
  INDEX  `quickbooks_synced_expenses_connectionId_idx` (`connectionId`),

  CONSTRAINT `quickbooks_synced_expenses_connectionId_fkey`
    FOREIGN KEY (`connectionId`) REFERENCES `quickbooks_connections`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
