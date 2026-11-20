CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`position` integer NOT NULL,
	`image_key` text NOT NULL,
	`content_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `concepts_job` ON `concepts` (`job_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text,
	`name` text NOT NULL,
	`style` text,
	`concept_count` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`error` text,
	`source_key` text,
	`chosen_concept_id` text,
	`prediction_id` text,
	`hook_token` text,
	`model_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_owner_status` ON `jobs` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text,
	`name` text NOT NULL,
	`prompt` text,
	`style` text,
	`source` text NOT NULL,
	`glb_key` text NOT NULL,
	`image_key` text,
	`size_bytes` integer NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `models_owner` ON `models` (`owner_id`);--> statement-breakpoint
CREATE INDEX `models_shared` ON `models` (`shared`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
