import { and, asc, count, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { concepts, jobs, models, users } from "@/db/schema";
import { deleteFiles, putFile, UserError } from "./files";

export const PAGE_SIZE = 12;

export const listInput = z
  .object({
    tab: z.enum(["mine", "shared"]).default("mine"),
    q: z.string().trim().max(200).default(""),
    source: z.enum(["all", "text", "image", "import"]).default("all"),
    sort: z.enum(["newest", "oldest", "name"]).default("newest"),
    page: z.number().int().min(1).max(10_000).default(1),
  })
  .strict();
export type ListInput = z.infer<typeof listInput>;

export const modelIdInput = z.object({ id: z.string().min(1) }).strict();
export const renameInput = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "Give it a name.").max(120),
  })
  .strict();
export const shareInput = z
  .object({ id: z.string().min(1), shared: z.boolean() })
  .strict();

interface Viewer {
  id: string;
  admin: boolean;
}

const listed = {
  id: models.id,
  name: models.name,
  prompt: models.prompt,
  style: models.style,
  source: models.source,
  hasImage: sql<boolean>`${models.imageKey} IS NOT NULL`.mapWith(Boolean),
  shared: models.shared,
  ownerId: models.ownerId,
  ownerEmail: users.email,
  createdAt: models.createdAt,
};

/** What a member may see: their own models, and every shared one. */
const visibleTo = (userId: string) =>
  or(eq(models.ownerId, userId), eq(models.shared, true))!;

export async function listModels(viewer: Viewer, input: ListInput) {
  const filters: SQL[] = [
    input.tab === "mine" ? eq(models.ownerId, viewer.id) : eq(models.shared, true),
  ];
  if (input.q) {
    const pattern = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(
      or(
        sql`${models.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${models.prompt} LIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }
  if (input.source !== "all") filters.push(eq(models.source, input.source));
  const where = and(...filters);
  const order =
    input.sort === "name"
      ? [asc(sql`lower(${models.name})`), asc(models.id)]
      : input.sort === "oldest"
        ? [asc(models.createdAt), asc(models.id)]
        : [desc(models.createdAt), desc(models.id)];
  const [total] = await db.select({ n: count() }).from(models).where(where);
  const pages = Math.max(1, Math.ceil((total?.n ?? 0) / PAGE_SIZE));
  const page = Math.min(input.page, pages);
  const rows = await db
    .select(listed)
    .from(models)
    .leftJoin(users, eq(users.id, models.ownerId))
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const anyOwned = input.tab === "mine" && !input.q && input.source === "all"
    ? (total?.n ?? 0) > 0
    : true;
  return {
    rows: rows.map((row) => ({
      ...row,
      isOwner: row.ownerId === viewer.id,
      canRemove: row.ownerId === viewer.id || (viewer.admin && row.shared),
    })),
    total: total?.n ?? 0,
    page,
    pages,
    empty: !anyOwned,
  };
}

export async function getModel(viewer: Viewer, id: string) {
  const row = await db
    .select({ ...listed, sizeBytes: models.sizeBytes })
    .from(models)
    .leftJoin(users, eq(users.id, models.ownerId))
    .where(and(eq(models.id, id), visibleTo(viewer.id)))
    .get();
  if (!row) return null;
  const isOwner = row.ownerId === viewer.id;
  return {
    ...row,
    isOwner,
    canRemove: isOwner || (viewer.admin && row.shared),
  };
}

/** The stored file keys of a model the viewer may see. */
export async function visibleFiles(viewerId: string, id: string) {
  return db
    .select({ name: models.name, glbKey: models.glbKey, imageKey: models.imageKey })
    .from(models)
    .where(and(eq(models.id, id), visibleTo(viewerId)))
    .get();
}

export async function renameModel(ownerId: string, { id, name }: z.infer<typeof renameInput>) {
  const [row] = await db
    .update(models)
    .set({ name })
    .where(and(eq(models.id, id), eq(models.ownerId, ownerId)))
    .returning({ id: models.id });
  if (!row) throw new UserError("Model not found.");
}

export async function setShared(ownerId: string, { id, shared }: z.infer<typeof shareInput>) {
  const [row] = await db
    .update(models)
    .set({ shared })
    .where(and(eq(models.id, id), eq(models.ownerId, ownerId)))
    .returning({ id: models.id });
  if (!row) throw new UserError("Model not found.");
}

/** Deletes a model, the job that made it and their files: the owner's, or a shared one for an admin. */
export async function deleteModel(viewer: Viewer, id: string) {
  const allowed = viewer.admin
    ? or(eq(models.ownerId, viewer.id), eq(models.shared, true))!
    : eq(models.ownerId, viewer.id);
  const model = await db
    .select()
    .from(models)
    .where(and(eq(models.id, id), allowed))
    .get();
  if (!model) throw new UserError("Model not found.");
  const job = model.jobId
    ? await db.select().from(jobs).where(eq(jobs.id, model.jobId)).get()
    : undefined;
  const images = model.jobId
    ? await db
        .select({ imageKey: concepts.imageKey })
        .from(concepts)
        .where(eq(concepts.jobId, model.jobId))
    : [];
  await db.batch([
    db.delete(models).where(eq(models.id, id)),
    db.delete(concepts).where(eq(concepts.jobId, model.jobId ?? "")),
    db.delete(jobs).where(eq(jobs.id, model.jobId ?? "")),
  ]);
  await deleteFiles([
    model.glbKey,
    model.imageKey,
    job?.sourceKey,
    ...images.map((row) => row.imageKey),
  ]);
}

export async function importModel(ownerId: string, bytes: Uint8Array, name: string) {
  const id = crypto.randomUUID();
  const glbKey = `models/${id}.glb`;
  await putFile(glbKey, bytes, "model/gltf-binary");
  await db.insert(models).values({
    id,
    ownerId,
    name,
    source: "import",
    glbKey,
    sizeBytes: bytes.length,
  });
  return { id };
}
