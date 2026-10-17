-- AlterTable: street_works_events.workCategory
-- Street Manager permit work category (work_category_ref): immediate_emergency,
-- immediate_urgent, major, standard, minor. Emergency and urgent works rank
-- first on a driver's road alerts. Nullable; activities carry no category.
-- One new nullable column; nothing existing changes.
ALTER TABLE `street_works_events` ADD COLUMN `workCategory` VARCHAR(32) NULL;
