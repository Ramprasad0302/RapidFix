-- DropIndex
DROP INDEX `otp_codes_phone_role_createdAt_idx` ON `otp_codes`;

-- DropIndex
DROP INDEX `users_phone_role_key` ON `users`;

-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `technicianNotes` VARCHAR(500) NULL,
    ADD COLUMN `videoUrl` VARCHAR(512) NULL;

-- AlterTable
ALTER TABLE `coupons` ADD COLUMN `highlights` JSON NULL;

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `city` VARCHAR(120) NULL,
    ADD COLUMN `language` VARCHAR(8) NOT NULL DEFAULT 'en',
    ADD COLUMN `marketingOptIn` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notificationsEnabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `otp_codes` DROP COLUMN `role`;

-- AlterTable
ALTER TABLE `service_categories` ADD COLUMN `professionalTitle` VARCHAR(60) NOT NULL DEFAULT 'Technician',
    ADD COLUMN `tagline` VARCHAR(120) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `services` ADD COLUMN `tagline` VARCHAR(160) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `technicians` MODIFY `villageTown` VARCHAR(120) NOT NULL DEFAULT '',
    MODIFY `district` VARCHAR(120) NOT NULL DEFAULT '',
    MODIFY `state` VARCHAR(80) NOT NULL DEFAULT '',
    MODIFY `pincode` VARCHAR(6) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX `otp_codes_phone_createdAt_idx` ON `otp_codes`(`phone`, `createdAt`);

-- CreateIndex
CREATE UNIQUE INDEX `users_phone_key` ON `users`(`phone`);

