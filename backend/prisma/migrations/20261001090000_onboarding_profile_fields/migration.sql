-- Customer & partner onboarding: date of birth, alternate contact, tools & vehicle.
ALTER TABLE `users` ADD COLUMN `dateOfBirth` DATE NULL;

ALTER TABLE `technicians`
    ADD COLUMN `alternatePhone` VARCHAR(16) NULL,
    ADD COLUMN `hasOwnTools` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasVehicle` BOOLEAN NOT NULL DEFAULT false;
