import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { notFound, serveFile } from "@/server/files";
import { jobSourceKey } from "@/server/jobs";

// The picture an image job started from, to the member who uploaded it.
export const Route = createFileRoute("/files/jobs/$id/source")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return notFound();
        return serveFile(await jobSourceKey(user.id, params.id));
      },
    },
  },
});
