-- Specific services a technician does within their categories.
-- IF NOT EXISTS: the API also creates this table at start-up (src/services/startupTasks.ts),
-- so the live database gets it without running migrations by hand.
CREATE TABLE IF NOT EXISTS `technician_services` (
    `technicianId` CHAR(36) NOT NULL,
    `serviceId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `technician_services_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`technicianId`, `serviceId`),
    CONSTRAINT `technician_services_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `technician_services_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
