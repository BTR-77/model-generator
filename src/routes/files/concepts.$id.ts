import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { notFound, serveFile } from "@/server/files";
import { conceptImageKey } from "@/server/jobs";

// A concept image, to the member whose job made it.
export const Route = createFileRoute("/files/concepts/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return notFound();
        return serveFile(await conceptImageKey(user.id, params.id));
      },
    },
  },
});
