CREATE TABLE `WebsiteIdentity` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subject` VARCHAR(190) NOT NULL,
  `userId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WebsiteIdentity_subject_key` (`subject`),
  UNIQUE INDEX `WebsiteIdentity_userId_key` (`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebsiteIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
