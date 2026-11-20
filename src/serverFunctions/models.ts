import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { readModelUpload, UserError } from "@/server/files";
import * as models from "@/server/models";
import { rememberUser } from "@/server/users";

const viewer = (user: Parameters<typeof isAdmin>[0] & { id: string }) => ({
  id: user.id,
  admin: isAdmin(user),
});

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => models.listInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    return models.listModels(viewer(user), data);
  });

export const getModel = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => models.modelIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    return models.getModel(viewer(user), data.id);
  });

export const renameModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => models.renameInput.parse(data))
  .handler(({ data, context: { user } }) => models.renameModel(user.id, data));

export const shareModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => models.shareInput.parse(data))
  .handler(({ data, context: { user } }) => models.setShared(user.id, data));

export const deleteModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => models.modelIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    models.deleteModel(viewer(user), data.id),
  );

export const importModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new UserError("Choose a .glb file.");
    return data;
  })
  .handler(async ({ data, context: { user } }) => {
    const bytes = await readModelUpload(data.get("file"));
    const file = data.get("file") as File;
    const given = String(data.get("name") ?? "").trim().slice(0, 120);
    const name = given || file.name.replace(/\.glb$/i, "").slice(0, 120) || "Imported model";
    await rememberUser(user);
    return models.importModel(user.id, bytes, name);
  });
