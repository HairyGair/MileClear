-- A number plate the DVLA cannot answer for.
--
-- The weekly vehicle-reminders refresh looks each primary vehicle's plate up
-- at the DVLA for MOT and tax dates. On 24 Sep 2026, 15 of 756 plates failed
-- every week (typos such as a zero for the letter O, foreign plates), and the
-- driver was never told, so they silently got no MOT or tax reminders.
-- dvlaPlateProblem is "not_found" or "invalid"; dvlaPlateSuggestion is a
-- look-alike correction the DVLA confirmed it knows. Both clear when the plate
-- is looked up successfully or the driver edits it.
ALTER TABLE `vehicles` ADD COLUMN `dvlaPlateProblem` VARCHAR(20) NULL,
    ADD COLUMN `dvlaPlateSuggestion` VARCHAR(10) NULL;
