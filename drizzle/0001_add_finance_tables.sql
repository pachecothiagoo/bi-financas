CREATE TABLE `finance_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `finance_recurring` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`legacyId` varchar(64),
	`title` varchar(120) NOT NULL,
	`category` varchar(64) NOT NULL,
	`kind` enum('income','expense') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`day` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_recurring_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_recurring_legacy_uq` UNIQUE(`accountId`,`legacyId`)
);
--> statement-breakpoint
CREATE TABLE `finance_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `finance_settings` (
	`accountId` int NOT NULL,
	`goalPercent` int NOT NULL DEFAULT 30,
	`monthOpeningBalances` json NOT NULL,
	`statementBalances` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_settings_accountId` PRIMARY KEY(`accountId`)
);
--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`externalId` varchar(191),
	`transactionDate` date NOT NULL,
	`description` varchar(255) NOT NULL,
	`category` varchar(64) NOT NULL,
	`kind` enum('income','expense') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`status` enum('realized','forecast') NOT NULL,
	`ignoreInFlow` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_transactions_external_uq` UNIQUE(`accountId`,`externalId`)
);
--> statement-breakpoint
ALTER TABLE `finance_recurring` ADD CONSTRAINT `finance_recurring_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_sessions` ADD CONSTRAINT `finance_sessions_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_settings` ADD CONSTRAINT `finance_settings_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_recurring_account_idx` ON `finance_recurring` (`accountId`);--> statement-breakpoint
CREATE INDEX `finance_sessions_account_idx` ON `finance_sessions` (`accountId`);--> statement-breakpoint
CREATE INDEX `finance_transactions_account_date_idx` ON `finance_transactions` (`accountId`,`transactionDate`);