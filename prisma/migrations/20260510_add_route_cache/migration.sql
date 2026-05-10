-- CreateTable: route_cache
-- Persistent cache of computed road distances. Once any route is
-- computed, every future request for the same coords (rounded to 4dp)
-- returns the cached value. Foundation for "manual trip A→B always
-- returns the same mileage" being a structural guarantee.
CREATE TABLE `route_cache` (
    `id` VARCHAR(191) NOT NULL,
    `startLatRounded` DOUBLE NOT NULL,
    `startLngRounded` DOUBLE NOT NULL,
    `endLatRounded` DOUBLE NOT NULL,
    `endLngRounded` DOUBLE NOT NULL,
    `distanceMiles` DOUBLE NOT NULL,
    `durationSecs` INTEGER NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `hitCount` INTEGER NOT NULL DEFAULT 0,
    `lastHitAt` DATETIME(3) NULL,

    UNIQUE INDEX `route_cache_coords_uk`(`startLatRounded`, `startLngRounded`, `endLatRounded`, `endLngRounded`),
    INDEX `route_cache_computedAt_idx`(`computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
