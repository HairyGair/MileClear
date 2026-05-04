/*
  Warnings:

  - You are about to drop the column `countryCode` on the `geofence_radius_observations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `geofence_radius_observations` DROP COLUMN `countryCode`;
