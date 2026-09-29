-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `role` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE') NOT NULL,
    `phone` VARCHAR(16) NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NULL,
    `name` VARCHAR(120) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_role_status_idx`(`role`, `status`),
    UNIQUE INDEX `users_phone_role_key`(`phone`, `role`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `otp_codes` (
    `id` CHAR(36) NOT NULL,
    `phone` VARCHAR(16) NOT NULL,
    `role` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE') NOT NULL,
    `codeHash` VARCHAR(255) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otp_codes_phone_role_createdAt_idx`(`phone`, `role`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(128) NOT NULL,
    `familyId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` CHAR(36) NULL,
    `userAgent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_idx`(`userId`),
    INDEX `refresh_tokens_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `department` VARCHAR(80) NULL,
    `lastLoginIp` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `referralCode` VARCHAR(16) NOT NULL,
    `referredById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_userId_key`(`userId`),
    UNIQUE INDEX `customers_referralCode_key`(`referralCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `label` ENUM('HOME', 'WORK', 'OTHER') NOT NULL DEFAULT 'HOME',
    `houseNo` VARCHAR(120) NOT NULL,
    `street` VARCHAR(160) NOT NULL DEFAULT '',
    `area` VARCHAR(120) NOT NULL,
    `villageTown` VARCHAR(120) NOT NULL,
    `district` VARCHAR(120) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `pincode` CHAR(6) NOT NULL,
    `landmark` VARCHAR(160) NOT NULL DEFAULT '',
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `addresses_customerId_deletedAt_idx`(`customerId`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `district` VARCHAR(120) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `radiusKm` INTEGER NOT NULL DEFAULT 15,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `locations_isActive_idx`(`isActive`),
    UNIQUE INDEX `locations_name_district_state_key`(`name`, `district`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_categories` (
    `id` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `name` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `iconKey` VARCHAR(40) NOT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_categories_slug_key`(`slug`),
    INDEX `service_categories_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `basePrice` INTEGER NOT NULL,
    `visitCharge` INTEGER NOT NULL DEFAULT 0,
    `durationMinMinutes` INTEGER NOT NULL,
    `durationMaxMinutes` INTEGER NOT NULL,
    `inclusions` JSON NOT NULL,
    `exclusions` JSON NOT NULL,
    `warrantyDays` INTEGER NOT NULL DEFAULT 0,
    `isPopular` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `services_slug_key`(`slug`),
    INDEX `services_categoryId_isActive_sortOrder_idx`(`categoryId`, `isActive`, `sortOrder`),
    INDEX `services_isPopular_isActive_idx`(`isPopular`, `isActive`),
    FULLTEXT INDEX `services_name_description_idx`(`name`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technicians` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `experienceYears` INTEGER NOT NULL DEFAULT 0,
    `bio` VARCHAR(500) NULL,
    `languages` JSON NOT NULL,
    `addressLine` VARCHAR(255) NOT NULL DEFAULT '',
    `villageTown` VARCHAR(120) NOT NULL,
    `district` VARCHAR(120) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `pincode` CHAR(6) NOT NULL,
    `baseLatitude` DOUBLE NULL,
    `baseLongitude` DOUBLE NULL,
    `serviceRadiusKm` INTEGER NOT NULL DEFAULT 10,
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `rejectionReason` VARCHAR(500) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `lastLatitude` DOUBLE NULL,
    `lastLongitude` DOUBLE NULL,
    `lastLocationAt` DATETIME(3) NULL,
    `activeJobCount` INTEGER NOT NULL DEFAULT 0,
    `completedJobs` INTEGER NOT NULL DEFAULT 0,
    `ratingAvg` DOUBLE NOT NULL DEFAULT 0,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `technicians_userId_key`(`userId`),
    INDEX `technicians_verificationStatus_isOnline_idx`(`verificationStatus`, `isOnline`),
    INDEX `technicians_district_state_idx`(`district`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_documents` (
    `id` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `type` ENUM('AADHAAR', 'PAN', 'DRIVING_LICENSE', 'CERTIFICATE', 'PROFILE_PHOTO', 'OTHER') NOT NULL,
    `fileUrl` VARCHAR(512) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `remarks` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `technician_documents_technicianId_idx`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_skills` (
    `technicianId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `technician_skills_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`technicianId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` CHAR(36) NOT NULL,
    `seq` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NULL,
    `customerId` CHAR(36) NOT NULL,
    `serviceId` CHAR(36) NOT NULL,
    `addressId` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NULL,
    `locationId` CHAR(36) NULL,
    `couponId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'SEARCHING', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ACCEPTED', 'TECHNICIAN_EN_ROUTE', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'ADDITIONAL_CHARGE_REQUESTED', 'ADDITIONAL_CHARGE_APPROVED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW', 'DISPUTED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `description` TEXT NOT NULL,
    `photos` JSON NOT NULL,
    `scheduleType` ENUM('NOW', 'SCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
    `scheduledFor` DATETIME(3) NOT NULL,
    `timeSlot` VARCHAR(8) NOT NULL,
    `addressSnapshot` JSON NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `serviceCharge` INTEGER NOT NULL,
    `visitCharge` INTEGER NOT NULL DEFAULT 0,
    `additionalChargesTotal` INTEGER NOT NULL DEFAULT 0,
    `discountAmount` INTEGER NOT NULL DEFAULT 0,
    `taxAmount` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` INTEGER NOT NULL,
    `commissionAmount` INTEGER NULL,
    `technicianEarning` INTEGER NULL,
    `paymentMethod` ENUM('CASH', 'UPI', 'RAZORPAY') NOT NULL DEFAULT 'CASH',
    `paymentStatus` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `cancellationReason` VARCHAR(500) NULL,
    `assignedAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_seq_key`(`seq`),
    UNIQUE INDEX `bookings_code_key`(`code`),
    INDEX `bookings_customerId_status_idx`(`customerId`, `status`),
    INDEX `bookings_technicianId_status_idx`(`technicianId`, `status`),
    INDEX `bookings_status_scheduledFor_idx`(`status`, `scheduledFor`),
    INDEX `bookings_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_status_history` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `fromStatus` ENUM('PENDING', 'SEARCHING', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ACCEPTED', 'TECHNICIAN_EN_ROUTE', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'ADDITIONAL_CHARGE_REQUESTED', 'ADDITIONAL_CHARGE_APPROVED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW', 'DISPUTED', 'REFUNDED') NULL,
    `toStatus` ENUM('PENDING', 'SEARCHING', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ACCEPTED', 'TECHNICIAN_EN_ROUTE', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'ADDITIONAL_CHARGE_REQUESTED', 'ADDITIONAL_CHARGE_APPROVED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW', 'DISPUTED', 'REFUNDED') NOT NULL,
    `changedById` CHAR(36) NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_status_history_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_assignments` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `status` ENUM('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'REASSIGNED') NOT NULL DEFAULT 'OFFERED',
    `distanceKm` DOUBLE NULL,
    `score` DOUBLE NULL,
    `isManual` BOOLEAN NOT NULL DEFAULT false,
    `assignedById` CHAR(36) NULL,
    `rejectReason` VARCHAR(255) NULL,
    `offeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `respondedAt` DATETIME(3) NULL,

    INDEX `booking_assignments_bookingId_status_idx`(`bookingId`, `status`),
    INDEX `booking_assignments_technicianId_status_idx`(`technicianId`, `status`),
    INDEX `booking_assignments_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_items` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `type` ENUM('SERVICE', 'VISIT', 'ADDITIONAL', 'PART') NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_items_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_additional_charges` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` VARCHAR(500) NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,

    INDEX `booking_additional_charges_bookingId_status_idx`(`bookingId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `method` ENUM('CASH', 'UPI', 'RAZORPAY') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `amount` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `razorpayOrderId` VARCHAR(64) NULL,
    `invoiceNumber` VARCHAR(32) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_bookingId_key`(`bookingId`),
    UNIQUE INDEX `payments_razorpayOrderId_key`(`razorpayOrderId`),
    UNIQUE INDEX `payments_invoiceNumber_key`(`invoiceNumber`),
    INDEX `payments_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `payments_method_status_idx`(`method`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_transactions` (
    `id` CHAR(36) NOT NULL,
    `paymentId` CHAR(36) NOT NULL,
    `type` ENUM('CHARGE', 'REFUND') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL,
    `amount` INTEGER NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `providerRef` VARCHAR(64) NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `rawPayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_transactions_idempotencyKey_key`(`idempotencyKey`),
    INDEX `payment_transactions_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commissions` (
    `id` CHAR(36) NOT NULL,
    `scope` ENUM('GLOBAL', 'CATEGORY', 'SERVICE', 'LOCATION', 'TECHNICIAN') NOT NULL,
    `categoryId` CHAR(36) NULL,
    `serviceId` CHAR(36) NULL,
    `locationId` CHAR(36) NULL,
    `technicianId` CHAR(36) NULL,
    `type` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `value` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `commissions_scope_isActive_idx`(`scope`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_wallets` (
    `id` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `totalEarned` INTEGER NOT NULL DEFAULT 0,
    `totalPaidOut` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `technician_wallets_technicianId_key`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_transactions` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NULL,
    `payoutId` CHAR(36) NULL,
    `type` ENUM('EARNING_CREDIT', 'COMMISSION_DEBIT', 'PAYOUT_DEBIT', 'ADJUSTMENT') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wallet_transactions_idempotencyKey_key`(`idempotencyKey`),
    INDEX `wallet_transactions_walletId_createdAt_idx`(`walletId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payouts` (
    `id` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('REQUESTED', 'PROCESSING', 'PAID', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
    `method` VARCHAR(32) NOT NULL DEFAULT 'BANK_TRANSFER',
    `reference` VARCHAR(128) NULL,
    `processedById` CHAR(36) NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payouts_technicianId_status_idx`(`technicianId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `terms` JSON NOT NULL,
    `discountType` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `discountValue` INTEGER NOT NULL,
    `minOrderAmount` INTEGER NOT NULL DEFAULT 0,
    `maxDiscountAmount` INTEGER NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `usageLimit` INTEGER NULL,
    `perCustomerLimit` INTEGER NOT NULL DEFAULT 1,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `isFirstBookingOnly` BOOLEAN NOT NULL DEFAULT false,
    `categoryId` CHAR(36) NULL,
    `serviceId` CHAR(36) NULL,
    `locationId` CHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_code_key`(`code`),
    INDEX `coupons_isActive_startsAt_endsAt_idx`(`isActive`, `startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_usage` (
    `id` CHAR(36) NOT NULL,
    `couponId` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `discountAmount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupon_usage_bookingId_key`(`bookingId`),
    INDEX `coupon_usage_couponId_customerId_idx`(`couponId`, `customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `technicianId` CHAR(36) NOT NULL,
    `rating` TINYINT NOT NULL,
    `comment` VARCHAR(1000) NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `reviews_bookingId_key`(`bookingId`),
    INDEX `reviews_technicianId_createdAt_idx`(`technicianId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `complaints` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NULL,
    `raisedById` CHAR(36) NOT NULL,
    `assignedToId` CHAR(36) NULL,
    `category` VARCHAR(60) NOT NULL,
    `subject` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `resolution` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `complaints_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `bookingId` CHAR(36) NOT NULL,
    `senderId` CHAR(36) NOT NULL,
    `body` TEXT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` VARCHAR(500) NOT NULL,
    `data` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` ENUM('WEB', 'ANDROID', 'IOS') NOT NULL DEFAULT 'WEB',
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_tokens_token_key`(`token`),
    INDEX `notification_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `actorRole` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE') NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `audit_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_logs_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(80) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(255) NULL,
    `updatedById` CHAR(36) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_users` ADD CONSTRAINT `admin_users_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_categories` ADD CONSTRAINT `service_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `service_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technicians` ADD CONSTRAINT `technicians_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_documents` ADD CONSTRAINT `technician_documents_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_skills` ADD CONSTRAINT `technician_skills_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_skills` ADD CONSTRAINT `technician_skills_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_addressId_fkey` FOREIGN KEY (`addressId`) REFERENCES `addresses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_status_history` ADD CONSTRAINT `booking_status_history_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_status_history` ADD CONSTRAINT `booking_status_history_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_assignments` ADD CONSTRAINT `booking_assignments_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_assignments` ADD CONSTRAINT `booking_assignments_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_additional_charges` ADD CONSTRAINT `booking_additional_charges_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_additional_charges` ADD CONSTRAINT `booking_additional_charges_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_wallets` ADD CONSTRAINT `technician_wallets_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `technician_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `payouts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usage` ADD CONSTRAINT `coupon_usage_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usage` ADD CONSTRAINT `coupon_usage_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usage` ADD CONSTRAINT `coupon_usage_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_tokens` ADD CONSTRAINT `notification_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
