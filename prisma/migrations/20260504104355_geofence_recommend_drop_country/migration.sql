/*
  Warnings:

  - The primary key for the `geofence_radius_recommendations` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `countryCode` on the `geofence_radius_recommendations` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `geofence_radius_recommendations` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `geofence_radius_recommendations_locationType_countryCode_key` ON `geofence_radius_recommendations`;

-- AlterTable
ALTER TABLE `geofence_radius_recommendations` DROP PRIMARY KEY,
    DROP COLUMN `countryCode`,
    DROP COLUMN `id`,
    ADD PRIMARY KEY (`locationType`);
