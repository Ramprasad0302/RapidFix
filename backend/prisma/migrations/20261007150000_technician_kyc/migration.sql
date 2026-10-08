-- Technician KYC for payouts: Aadhaar (encrypted, last 4 readable) and PAN.
-- One column per statement so the start-up upgrade (applyIdempotent) can skip each one already present.
ALTER TABLE `technicians` ADD COLUMN `aadhaarEnc` VARCHAR(512) NULL;
ALTER TABLE `technicians` ADD COLUMN `aadhaarLast4` VARCHAR(4) NULL;
ALTER TABLE `technicians` ADD COLUMN `panNumber` VARCHAR(10) NULL;
