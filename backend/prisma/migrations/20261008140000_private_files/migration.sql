-- ID proofs and other private uploads stored in the database (they used to live only on the server disk, which a redeploy can wipe).
-- CreateTable
CREATE TABLE `private_files` (
    `path` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(60) NOT NULL,
    `size` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`path`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

