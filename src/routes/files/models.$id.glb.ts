import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { notFound, serveFile, slug } from "@/server/files";
import { visibleFiles } from "@/server/models";

// A model's GLB, for its owner, or for any member once it is shared.
export const Route = createFileRoute("/files/models/$id/glb")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return notFound();
        const model = await visibleFiles(user.id, params.id);
        if (!model) return notFound();
        const download = new URL(request.url).searchParams.has("download");
        return serveFile(model.glbKey, {
          download: download ? `${slug(model.name)}.glb` : undefined,
        });
      },
    },
  },
});
