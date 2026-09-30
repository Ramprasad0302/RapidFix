-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `pushedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `razorpayPaymentId` VARCHAR(64) NULL,
    ADD COLUMN `refundedAmount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `technicians` ADD COLUMN `bankAccountEnc` VARCHAR(512) NULL,
    ADD COLUMN `bankAccountHolder` VARCHAR(120) NULL,
    ADD COLUMN `bankAccountLast4` VARCHAR(4) NULL,
    ADD COLUMN `bankIfsc` VARCHAR(11) NULL,
    ADD COLUMN `payoutUpiId` VARCHAR(80) NULL;

-- CreateIndex
CREATE INDEX `notifications_pushedAt_createdAt_idx` ON `notifications`(`pushedAt`, `createdAt`);

