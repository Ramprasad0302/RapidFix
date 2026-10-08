-- Spare parts the technician bought for a job: itemised on the bill and invoice, reimbursed to the technician.
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `sparePartsTotal` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `booking_spare_parts` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `billPhotoUrl` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_spare_parts_bookingId_idx`(`bookingId`),
    INDEX `booking_spare_parts_technicianId_idx`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `booking_spare_parts` ADD CONSTRAINT `booking_spare_parts_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_spare_parts` ADD CONSTRAINT `booking_spare_parts_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

