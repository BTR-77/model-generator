import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@/server/files";
import { finishRun } from "@/server/jobs";
import type { Prediction } from "@/server/generation";

// Public: the generation service posts a finished run here. The token is
// random per run and only works while that run's job is waiting for it.
export const Route = createFileRoute("/hooks/replicate/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^[0-9a-f]{48}$/.test(params.token)) return notFound();
        const prediction = (await request.json().catch(() => null)) as Prediction | null;
        if (!prediction || typeof prediction !== "object") return notFound();
        const applied = await finishRun(params.token, prediction);
        return applied ? Response.json({ ok: true }) : notFound();
      },
    },
  },
});
