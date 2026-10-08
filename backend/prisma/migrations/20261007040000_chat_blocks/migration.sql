-- One side of a booking's chat blocked the other (App Store guideline 1.2).
-- IF NOT EXISTS: the API also creates this table at start-up (src/services/startupTasks.ts),
-- so the live database gets it without running migrations by hand.
CREATE TABLE IF NOT EXISTS `chat_blocks` (
    `bookingId` CHAR(36) NOT NULL,
    `blockerId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_blocks_blockerId_idx`(`blockerId`),
    PRIMARY KEY (`bookingId`, `blockerId`),
    CONSTRAINT `chat_blocks_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `chat_blocks_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
