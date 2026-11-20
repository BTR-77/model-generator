import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { notFound, serveFile } from "@/server/files";
import { visibleFiles } from "@/server/models";

// The picture a model was made from, to whoever may see the model.
export const Route = createFileRoute("/files/models/$id/image")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return notFound();
        const model = await visibleFiles(user.id, params.id);
        return model ? serveFile(model.imageKey) : notFound();
      },
    },
  },
});
