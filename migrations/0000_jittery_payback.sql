CREATE TABLE `agenda_task_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agenda_task_id` integer NOT NULL,
	`condition_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`agenda_task_id`) REFERENCES `agenda_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`condition_id`) REFERENCES `environment_conditions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agenda_task_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agenda_task_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`agenda_task_id`) REFERENCES `agenda_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `environment_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agenda_task_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agenda_task_id` integer NOT NULL,
	`place_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`agenda_task_id`) REFERENCES `agenda_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `environment_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agenda_task_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agenda_task_id` integer NOT NULL,
	`provider_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`agenda_task_id`) REFERENCES `agenda_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `environment_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agenda_task_things` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agenda_task_id` integer NOT NULL,
	`thing_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`agenda_task_id`) REFERENCES `agenda_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thing_id`) REFERENCES `environment_things`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agenda_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`origin` text NOT NULL,
	`origin_id` integer,
	`title` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`time` text,
	`duration_minutes` integer,
	`is_all_day` integer DEFAULT 0 NOT NULL,
	`role_id` integer,
	`responsibility_id` integer,
	`status` text DEFAULT 'ready' NOT NULL,
	`color` text,
	`recurrence_rule` text,
	`recurrence_end_date` text,
	`series_id` integer,
	`is_override` integer DEFAULT 0 NOT NULL,
	`original_date` text,
	`is_cancelled` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`state` text DEFAULT 'available' NOT NULL,
	`unavailable_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`state` text DEFAULT 'available' NOT NULL,
	`unavailable_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`state` text DEFAULT 'available' NOT NULL,
	`unavailable_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`state` text DEFAULT 'available' NOT NULL,
	`unavailable_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_things` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`state` text DEFAULT 'available' NOT NULL,
	`unavailable_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_calendars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`color` text DEFAULT '#4285F4' NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL,
	`last_synced_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendar_id` integer NOT NULL,
	`uid` text NOT NULL,
	`title` text DEFAULT '(No title)' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`is_all_day` integer DEFAULT 0 NOT NULL,
	`description` text,
	`location` text,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `external_calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fcm_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`user_agent` text,
	`timezone` text,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE TABLE `filed_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`note` text NOT NULL,
	`tag` text,
	`source_inbox_item_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_inbox_item_id`) REFERENCES `inbox_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`content` text NOT NULL,
	`notes` text,
	`processed` integer DEFAULT 0 NOT NULL,
	`processed_as` text,
	`deleted_at` text,
	`reference_project_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reference_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`invited_by` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE TABLE `notification_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`notification_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`scheduled_for` text NOT NULL,
	`sent_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`failure_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`time_format` text DEFAULT '12h' NOT NULL,
	`clarity_skip_ritual` integer DEFAULT 0 NOT NULL,
	`show_responsibility` integer DEFAULT 1 NOT NULL,
	`show_project_task` integer DEFAULT 1 NOT NULL,
	`show_standalone` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`condition_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`condition_id`) REFERENCES `environment_conditions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_environment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`project_id` integer NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `environment_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`place_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `environment_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`provider_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `environment_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_responsibility` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`responsibility_id` integer NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	`start_date` text,
	`end_date` text,
	`is_all_day` integer DEFAULT 0 NOT NULL,
	`sort_order` integer,
	`color` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_things` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`thing_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thing_id`) REFERENCES `environment_things`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`trigger` text,
	`start_date` text,
	`end_date` text,
	`outcome_done` text,
	`status` text,
	`priority` text,
	`target_date` text,
	`next_action` text,
	`blockers` text,
	`risks_watchouts` text,
	`notes` text,
	`last_touched_at` text,
	`stalled_at` text,
	`created_at` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `responsibilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`custom_cron_expr` text,
	`is_preset` integer DEFAULT 0 NOT NULL,
	`color` text,
	`recurrence_rule` text,
	`start_date` text,
	`recurrence_end_date` text,
	`project_id` integer,
	`response` text,
	`cue` text,
	`craving` text,
	`reward` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responsibility_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`condition_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`condition_id`) REFERENCES `environment_conditions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responsibility_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `environment_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responsibility_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`place_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `environment_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responsibility_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`provider_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `environment_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responsibility_role` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responsibility_things` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`responsibility_id` integer NOT NULL,
	`thing_id` integer NOT NULL,
	`relationship_type` text DEFAULT 'primary' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`covers_id` integer,
	FOREIGN KEY (`responsibility_id`) REFERENCES `responsibilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thing_id`) REFERENCES `environment_things`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL,
	`person_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`screenshot_base64` text,
	`page_url` text,
	`user_agent` text,
	`screen_size` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`series_id` integer,
	`original_date` text,
	`agenda_task_id` integer,
	`status` text NOT NULL,
	`rescheduled_to` text,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by` integer,
	`agenda_default_view` text DEFAULT 'day' NOT NULL,
	`agenda_hour_height_px` integer DEFAULT 56 NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text,
	`notifications_enabled` integer DEFAULT 0 NOT NULL,
	`task_reminder_minutes` integer DEFAULT 15 NOT NULL,
	`daily_review_enabled` integer DEFAULT 0 NOT NULL,
	`daily_review_time` text DEFAULT '09:00' NOT NULL,
	`project_deadline_alerts_enabled` integer DEFAULT 0 NOT NULL,
	`project_deadline_days_before` integer DEFAULT 1 NOT NULL,
	`stalled_project_alerts_enabled` integer DEFAULT 0 NOT NULL,
	`stalled_project_days_threshold` integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`week_of` text NOT NULL,
	`wins` text,
	`lessons` text,
	`next_week_focus` text,
	`inbox_cleared` integer DEFAULT 0 NOT NULL,
	`projects_reviewed` integer DEFAULT 0 NOT NULL,
	`habits_reviewed` integer DEFAULT 0 NOT NULL,
	`puzzle_piece_ratings` text,
	`created_at` text NOT NULL
);
