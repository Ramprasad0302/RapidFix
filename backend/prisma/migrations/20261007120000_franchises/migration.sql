-- AlterTable
ALTER TABLE `audit_logs` MODIFY `actorRole` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE', 'FRANCHISE_ADMIN') NULL;
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `franchiseId` CHAR(36) NULL;
-- AlterTable
ALTER TABLE `customers` ADD COLUMN `franchiseId` CHAR(36) NULL;
-- AlterTable
ALTER TABLE `locations` ADD COLUMN `franchiseId` CHAR(36) NULL;
-- AlterTable
ALTER TABLE `technicians` ADD COLUMN `franchiseId` CHAR(36) NULL;
-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE', 'FRANCHISE_ADMIN') NOT NULL;
-- CreateTable
CREATE TABLE `franchises` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `town` VARCHAR(120) NOT NULL,
    `district` VARCHAR(120) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `userId` CHAR(36) NOT NULL,
    `ownerName` VARCHAR(120) NOT NULL,
    `ownerPhone` VARCHAR(16) NOT NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerDateOfBirth` DATE NULL,
    `ownerAddress` VARCHAR(500) NOT NULL,
    `ownerPincode` VARCHAR(6) NOT NULL,
    `aadhaarEnc` VARCHAR(512) NOT NULL,
    `aadhaarLast4` VARCHAR(4) NOT NULL,
    `aadhaarFrontUrl` VARCHAR(512) NOT NULL,
    `aadhaarBackUrl` VARCHAR(512) NULL,
    `panNumber` VARCHAR(10) NULL,
    `panPhotoUrl` VARCHAR(512) NULL,
    `gstin` VARCHAR(15) NULL,
    `businessName` VARCHAR(160) NULL,
    `commissionPercent` DECIMAL(5, 2) NOT NULL,
    `agreementStart` DATE NOT NULL,
    `agreementEnd` DATE NULL,
    `agreementUrl` VARCHAR(512) NULL,
    `depositAmount` INTEGER NOT NULL DEFAULT 0,
    `bankAccountHolder` VARCHAR(120) NULL,
    `bankIfsc` VARCHAR(11) NULL,
    `bankAccountEnc` VARCHAR(512) NULL,
    `bankAccountLast4` VARCHAR(4) NULL,
    `upiId` VARCHAR(80) NULL,
    `emergencyContact` VARCHAR(16) NULL,
    `notes` TEXT NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `franchises_code_key`(`code`),
    UNIQUE INDEX `franchises_userId_key`(`userId`),
    INDEX `franchises_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateIndex
CREATE INDEX `bookings_franchiseId_createdAt_idx` ON `bookings`(`franchiseId`, `createdAt`);
-- CreateIndex
CREATE INDEX `customers_franchiseId_idx` ON `customers`(`franchiseId`);
-- CreateIndex
CREATE INDEX `locations_franchiseId_idx` ON `locations`(`franchiseId`);
-- CreateIndex
CREATE INDEX `technicians_franchiseId_idx` ON `technicians`(`franchiseId`);
-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchises`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `locations` ADD CONSTRAINT `locations_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchises`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `technicians` ADD CONSTRAINT `technicians_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchises`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchises`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `franchises` ADD CONSTRAINT `franchises_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `franchises` ADD CONSTRAINT `franchises_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
