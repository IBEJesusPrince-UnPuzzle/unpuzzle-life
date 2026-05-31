DROP TABLE `notification_queue`;--> statement-breakpoint
ALTER TABLE `users` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `fcm_tokens` DROP COLUMN `timezone`;