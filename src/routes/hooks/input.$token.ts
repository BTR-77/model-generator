import { createFileRoute } from "@tanstack/react-router";
import { notFound, serveFile } from "@/server/files";
import { inputImageKey } from "@/server/jobs";

// Public: the generation service fetches the picture it turns into a model.
// Served only while that run is going, under its random token.
export const Route = createFileRoute("/hooks/input/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f]{48}$/.test(params.token)) return notFound();
        return serveFile(await inputImageKey(params.token));
      },
    },
  },
});
