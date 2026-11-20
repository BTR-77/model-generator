import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { concepts, jobs, models } from "@/db/schema";
import { nameFromPrompt } from "./names";
import { deleteFiles, imageType, isGlb, putFile, UserError } from "./files";
import {
  conceptRequest,
  failureReason,
  fetchOutput,
  meshRequest,
  outputUrls,
  startPrediction,
  STYLES,
  type Prediction,
  type Style,
} from "./generation";

const MAX_RUNNING = 3;
const STALE_AFTER_MS = 30 * 60 * 1000;
const RUNNING = ["queued", "generating"] as const;
const LIMIT_MESSAGE = `You already have ${MAX_RUNNING} jobs running.`;

export const textJobInput = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "Describe the model you want.")
      .max(800, "Keep the description under 800 characters."),
    style: z.enum(STYLES),
    count: z.number().int().min(1).max(4),
  })
  .strict();
export const jobIdInput = z.object({ id: z.string().min(1) }).strict();
export const pickInput = z
  .object({ id: z.string().min(1), conceptId: z.string().min(1) })
  .strict();

const now = () => new Date().toISOString();
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const RUNNING_COUNT = `(SELECT count(*) FROM jobs WHERE owner_id = ? AND status IN ('queued', 'generating')) < ${MAX_RUNNING}`;

/** Jobs that never heard back fail, so they stop counting as running. */
async function expireStale(ownerId: string) {
  const before = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  await env.DB.prepare(
    `UPDATE jobs SET status = 'failed', error = 'The generation service didn''t answer in time.', hook_token = NULL, updated_at = ?
     WHERE owner_id = ? AND status IN ('queued', 'generating') AND updated_at < ?`,
  )
    .bind(now(), ownerId, before)
    .run();
}

async function insertJob(values: {
  id: string;
  ownerId: string;
  kind: "text" | "image";
  prompt: string | null;
  name: string;
  style: Style | null;
  count: number;
  stage: "concepts" | "model";
  sourceKey: string | null;
}): Promise<string> {
  await expireStale(values.ownerId);
  const run = token();
  const result = await env.DB.prepare(
    `INSERT INTO jobs (id, owner_id, kind, prompt, name, style, concept_count, status, stage, source_key, hook_token, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RUNNING_COUNT}`,
  )
    .bind(
      values.id,
      values.ownerId,
      values.kind,
      values.prompt,
      values.name,
      values.style,
      values.count,
      values.stage === "concepts" ? "queued" : "generating",
      values.stage,
      values.sourceKey,
      run,
      now(),
      values.ownerId,
    )
    .run();
  if (!result.meta.changes) throw new UserError(LIMIT_MESSAGE);
  return run;
}

/**
 * Moves an owner's job from one of `from` into a new run of `stage`, if
 * they have fewer than the running limit. Returns the run's token.
 */
async function claimRun(
  ownerId: string,
  id: string,
  from: string[],
  stage: "concepts" | "model",
  extra: { chosenConceptId?: string } = {},
): Promise<string> {
  await expireStale(ownerId);
  const run = token();
  const status = stage === "concepts" ? "queued" : "generating";
  const result = await env.DB.prepare(
    `UPDATE jobs SET status = ?, stage = ?, error = NULL, prediction_id = NULL, hook_token = ?, updated_at = ?,
       chosen_concept_id = coalesce(?, chosen_concept_id)
     WHERE id = ? AND owner_id = ? AND status IN (${from.map(() => "?").join(", ")}) AND ${RUNNING_COUNT}`,
  )
    .bind(
      status,
      stage,
      run,
      now(),
      extra.chosenConceptId ?? null,
      id,
      ownerId,
      ...from,
      ownerId,
    )
    .run();
  if (result.meta.changes) return run;
  const job = await findOwnJob(ownerId, id);
  if (!job) throw new UserError("Job not found.");
  if (!from.includes(job.status))
    throw new UserError("This job has moved on. Reload to see where it is.");
  throw new UserError(LIMIT_MESSAGE);
}

function findOwnJob(ownerId: string, id: string) {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)))
    .get();
}

/** Sends a claimed run to the generation service. */
async function launch(jobId: string, run: string, origin: string) {
  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job || job.hookToken !== run) return;
  const request =
    job.stage === "concepts"
      ? conceptRequest(
          job.prompt ?? job.name,
          (job.style ?? "realistic") as Style,
          job.conceptCount,
        )
      : meshRequest(`${origin}/hooks/input/${run}`);
  let prediction: Prediction;
  try {
    prediction = await startPrediction(request, `${origin}/hooks/replicate/${run}`);
  } catch (error) {
    prediction = {
      status: "failed",
      error: error instanceof Error ? error.message : "The run couldn't start.",
    };
  }
  if (prediction.id) {
    await db
      .update(jobs)
      .set({ predictionId: prediction.id, updatedAt: now() })
      .where(and(eq(jobs.id, jobId), eq(jobs.hookToken, run)));
  }
  if (["succeeded", "failed", "canceled"].includes(prediction.status ?? ""))
    await finishRun(run, prediction);
}

/** Applies a finished run to the job it belongs to. False when no running job has that token. */
export async function finishRun(
  run: string,
  prediction: Prediction,
): Promise<boolean> {
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hookToken, run), inArray(jobs.status, [...RUNNING])))
    .get();
  if (!job) return false;
  if (job.predictionId && prediction.id && job.predictionId !== prediction.id)
    return false;
  if (prediction.status !== "succeeded") {
    await fail(job.id, run, failureReason(prediction));
    return true;
  }
  try {
    if (job.stage === "concepts") await saveConcepts(job, run, prediction);
    else await saveModel(job, run, prediction);
  } catch (error) {
    await fail(
      job.id,
      run,
      error instanceof Error ? error.message : "The result couldn't be saved.",
    );
  }
  return true;
}

async function fail(id: string, run: string, reason: string) {
  await db
    .update(jobs)
    .set({ status: "failed", error: reason, hookToken: null, updatedAt: now() })
    .where(and(eq(jobs.id, id), eq(jobs.hookToken, run)));
}

type JobRow = typeof jobs.$inferSelect;

async function saveConcepts(job: JobRow, run: string, prediction: Prediction) {
  const urls = outputUrls(prediction.output).slice(0, job.conceptCount);
  if (!urls.length) throw new Error("The run returned no images.");
  const saved = [];
  for (const [position, url] of urls.entries()) {
    const { bytes } = await fetchOutput(url);
    const contentType = imageType(bytes);
    if (!contentType) throw new Error("The run returned an unreadable image.");
    const id = crypto.randomUUID();
    const key = `concepts/${job.id}/${id}`;
    await putFile(key, bytes, contentType);
    saved.push({ id, jobId: job.id, ownerId: job.ownerId, position, imageKey: key, contentType });
  }
  const previous = await db
    .select({ imageKey: concepts.imageKey })
    .from(concepts)
    .where(eq(concepts.jobId, job.id));
  await db.batch([
    db.delete(concepts).where(eq(concepts.jobId, job.id)),
    db.insert(concepts).values(saved),
    db
      .update(jobs)
      .set({ status: "concepts_ready", hookToken: null, chosenConceptId: null, updatedAt: now() })
      .where(and(eq(jobs.id, job.id), eq(jobs.hookToken, run))),
  ]);
  await deleteFiles(previous.map((row) => row.imageKey));
}

async function saveModel(job: JobRow, run: string, prediction: Prediction) {
  const url = outputUrls(prediction.output)[0];
  if (!url) throw new Error("The run returned no model.");
  const { bytes } = await fetchOutput(url);
  if (!isGlb(bytes)) throw new Error("The run returned an unreadable model.");
  const modelId = crypto.randomUUID();
  const glbKey = `models/${modelId}.glb`;
  await putFile(glbKey, bytes, "model/gltf-binary");
  let imageKey = job.sourceKey;
  if (job.kind === "text" && job.chosenConceptId) {
    const concept = await db
      .select({ imageKey: concepts.imageKey })
      .from(concepts)
      .where(eq(concepts.id, job.chosenConceptId))
      .get();
    imageKey = concept?.imageKey ?? null;
  }
  await db.batch([
    db.insert(models).values({
      id: modelId,
      ownerId: job.ownerId,
      jobId: job.id,
      name: job.name,
      prompt: job.prompt,
      style: job.style,
      source: job.kind,
      glbKey,
      imageKey,
      sizeBytes: bytes.length,
    }),
    db
      .update(jobs)
      .set({ status: "succeeded", modelId, hookToken: null, updatedAt: now() })
      .where(and(eq(jobs.id, job.id), eq(jobs.hookToken, run))),
  ]);
}

// --- What members do ---

export async function createTextJob(
  ownerId: string,
  input: z.infer<typeof textJobInput>,
  origin: string,
) {
  const id = crypto.randomUUID();
  const run = await insertJob({
    id,
    ownerId,
    kind: "text",
    prompt: input.prompt,
    name: nameFromPrompt(input.prompt),
    style: input.style,
    count: input.count,
    stage: "concepts",
    sourceKey: null,
  });
  await launch(id, run, origin);
  return { id };
}

export async function createImageJob(
  ownerId: string,
  image: { bytes: Uint8Array; contentType: string },
  name: string,
  origin: string,
) {
  const id = crypto.randomUUID();
  const sourceKey = `sources/${id}`;
  await putFile(sourceKey, image.bytes, image.contentType);
  let run: string;
  try {
    run = await insertJob({
      id,
      ownerId,
      kind: "image",
      prompt: null,
      name,
      style: null,
      count: 1,
      stage: "model",
      sourceKey,
    });
  } catch (error) {
    await deleteFiles([sourceKey]);
    throw error;
  }
  await launch(id, run, origin);
  return { id };
}

/** Discards the concepts and runs the prompt again. */
export async function regenerateConcepts(ownerId: string, id: string, origin: string) {
  const job = await findOwnJob(ownerId, id);
  if (!job || job.kind !== "text") throw new UserError("Job not found.");
  const run = await claimRun(ownerId, id, ["concepts_ready"], "concepts");
  await launch(id, run, origin);
}

export async function pickConcept(
  ownerId: string,
  { id, conceptId }: z.infer<typeof pickInput>,
  origin: string,
) {
  const concept = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.jobId, id), eq(concepts.ownerId, ownerId)))
    .get();
  if (!concept) throw new UserError("Pick one of this job's concepts.");
  const run = await claimRun(ownerId, id, ["concepts_ready"], "model", {
    chosenConceptId: conceptId,
  });
  await launch(id, run, origin);
}

/** Runs a failed job's step again with the same inputs. */
export async function retryJob(ownerId: string, id: string, origin: string) {
  const job = await findOwnJob(ownerId, id);
  if (!job) throw new UserError("Job not found.");
  if (job.status !== "failed") throw new UserError("Only a failed job can be retried.");
  const run = await claimRun(ownerId, id, ["failed"], job.stage);
  await launch(id, run, origin);
}

export async function getJob(ownerId: string, id: string) {
  await expireStale(ownerId);
  const job = await findOwnJob(ownerId, id);
  if (!job) return null;
  const images = await db
    .select({ id: concepts.id, position: concepts.position })
    .from(concepts)
    .where(eq(concepts.jobId, id))
    .orderBy(asc(concepts.position));
  return {
    id: job.id,
    kind: job.kind,
    prompt: job.prompt,
    name: job.name,
    style: job.style,
    count: job.conceptCount,
    status: job.status,
    stage: job.stage,
    error: job.error,
    hasSource: !!job.sourceKey,
    chosenConceptId: job.chosenConceptId,
    modelId: job.modelId,
    createdAt: job.createdAt,
    concepts: job.status === "concepts_ready" ? images : [],
  };
}

/** The member's jobs still in progress, waiting on them, or failed. */
export async function listOpenJobs(ownerId: string) {
  await expireStale(ownerId);
  return db
    .select({
      id: jobs.id,
      kind: jobs.kind,
      name: jobs.name,
      status: jobs.status,
      error: jobs.error,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.ownerId, ownerId),
        inArray(jobs.status, ["queued", "generating", "concepts_ready", "failed"]),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(20);
}

export async function discardJob(ownerId: string, id: string) {
  const job = await findOwnJob(ownerId, id);
  if (!job || !["failed", "concepts_ready"].includes(job.status))
    throw new UserError("Only a failed job or unpicked concepts can be discarded.");
  const images = await db
    .select({ imageKey: concepts.imageKey })
    .from(concepts)
    .where(eq(concepts.jobId, id));
  await db.batch([
    db.delete(concepts).where(eq(concepts.jobId, id)),
    db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId))),
  ]);
  await deleteFiles([job.sourceKey, ...images.map((row) => row.imageKey)]);
}

/** The picture the service turns into a model, while that run is going. */
export async function inputImageKey(run: string): Promise<string | null> {
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hookToken, run), eq(jobs.status, "generating")))
    .get();
  if (!job) return null;
  if (job.kind === "image") return job.sourceKey;
  if (!job.chosenConceptId) return null;
  const concept = await db
    .select({ imageKey: concepts.imageKey })
    .from(concepts)
    .where(and(eq(concepts.id, job.chosenConceptId), eq(concepts.jobId, job.id)))
    .get();
  return concept?.imageKey ?? null;
}

export async function conceptImageKey(ownerId: string, conceptId: string) {
  const row = await db
    .select({ imageKey: concepts.imageKey })
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.ownerId, ownerId)))
    .get();
  return row?.imageKey ?? null;
}

export async function jobSourceKey(ownerId: string, id: string) {
  return (await findOwnJob(ownerId, id))?.sourceKey ?? null;
}
