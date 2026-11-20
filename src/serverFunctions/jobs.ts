import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { readImageUpload, UserError } from "@/server/files";
import { generationReady } from "@/server/generation";
import * as jobs from "@/server/jobs";
import { rememberUser } from "@/server/users";

/** Where the generation service reaches this app: the request's own origin. */
const origin = () => new URL(getRequest().url).origin;

async function requireGeneration() {
  if (!(await generationReady())) throw new UserError("Generation isn't set up.");
}

export const getCreatePage = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await rememberUser(user);
    return { ready: await generationReady() };
  });

export const getTasks = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => jobs.listOpenJobs(user.id));

export const getJob = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(({ data, context: { user } }) => jobs.getJob(user.id, data.id));

export const startTextJob = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.textJobInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await requireGeneration();
    await rememberUser(user);
    return jobs.createTextJob(user.id, data, origin());
  });

export const startImageJob = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new UserError("Choose an image.");
    return data;
  })
  .handler(async ({ data, context: { user } }) => {
    const image = await readImageUpload(data.get("file"));
    await requireGeneration();
    await rememberUser(user);
    const file = data.get("file") as File;
    const given = String(data.get("name") ?? "").trim().slice(0, 120);
    const name =
      given || file.name.replace(/\.(png|jpe?g|webp)$/i, "").slice(0, 120) || "Untitled model";
    return jobs.createImageJob(user.id, image, name, origin());
  });

export const pickConcept = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.pickInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await requireGeneration();
    await jobs.pickConcept(user.id, data, origin());
  });

export const regenerateConcepts = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await requireGeneration();
    await jobs.regenerateConcepts(user.id, data.id, origin());
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await requireGeneration();
    await jobs.retryJob(user.id, data.id, origin());
  });

export const discardJob = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(({ data, context: { user } }) => jobs.discardJob(user.id, data.id));
