import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** Members the app has seen, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/**
 * A generation job. Text jobs go queued → concepts_ready → generating →
 * succeeded; image jobs go queued → generating → succeeded. Either may end
 * in failed, with a reason.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind", { enum: ["text", "image"] }).notNull(),
    prompt: text("prompt"),
    name: text("name").notNull(),
    style: text("style"),
    conceptCount: integer("concept_count").notNull().default(1),
    status: text("status", {
      enum: ["queued", "concepts_ready", "generating", "succeeded", "failed"],
    }).notNull(),
    // Which step a failure happened in, so a retry repeats that step.
    stage: text("stage", { enum: ["concepts", "model"] }).notNull(),
    error: text("error"),
    sourceKey: text("source_key"),
    chosenConceptId: text("chosen_concept_id"),
    predictionId: text("prediction_id"),
    // Random per run: the webhook and input URLs the service is given.
    hookToken: text("hook_token"),
    modelId: text("model_id"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("jobs_owner_status").on(table.ownerId, table.status)],
);

export const concepts = sqliteTable(
  "concepts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    ownerId: text("owner_id").notNull(),
    position: integer("position").notNull(),
    imageKey: text("image_key").notNull(),
    contentType: text("content_type").notNull(),
  },
  (table) => [index("concepts_job").on(table.jobId)],
);

export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    jobId: text("job_id"),
    name: text("name").notNull(),
    prompt: text("prompt"),
    style: text("style"),
    source: text("source", { enum: ["text", "image", "import"] }).notNull(),
    glbKey: text("glb_key").notNull(),
    imageKey: text("image_key"),
    sizeBytes: integer("size_bytes").notNull(),
    shared: integer("shared", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("models_owner").on(table.ownerId),
    index("models_shared").on(table.shared),
  ],
);
