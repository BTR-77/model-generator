import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { isRunning, JobStatusBadge } from "@/client/components/JobStatusBadge";
import { NotFoundState } from "@/client/components/NotFoundState";
import { PageHeader } from "@/client/components/PageHeader";
import { usePolling } from "@/client/components/TaskList";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { errorMessage, STYLE_LABELS } from "@/client/lib/labels";
import {
  discardJob,
  getJob,
  pickConcept,
  regenerateConcepts,
  retryJob,
} from "@/serverFunctions/jobs";
import { cn } from "cn";

export const Route = createFileRoute("/jobs/$id")({
  loader: ({ params }) => getJob({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Job"} · Model Generator` }],
  }),
  component: JobPage,
});

function JobPage() {
  const job = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePolling(!!job && isRunning(job.status));

  if (!job)
    return (
      <AppShell nav={<AppNav />}>
        <NotFoundState what="Job" />
      </AppShell>
    );

  async function act(name: string, work: () => Promise<unknown>) {
    setError(null);
    setPending(name);
    try {
      await work();
      setSelected(null);
      await router.invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(null);
    }
  }

  const id = job.id;
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={job.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} testId="job-status" />
            <span>{job.kind === "text" ? "From text" : "From an image"}</span>
            {job.style ? <span>· {STYLE_LABELS[job.style] ?? job.style}</span> : null}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        {job.prompt ? (
          <p data-testid="job-prompt" className="rounded-xl border border-border bg-card p-4 text-sm">
            {job.prompt}
          </p>
        ) : null}
        {job.hasSource ? (
          <img
            src={`/files/jobs/${id}/source`}
            alt="The uploaded image"
            className="size-40 rounded-xl border border-border bg-muted object-cover"
          />
        ) : null}
      </div>

      {isRunning(job.status) ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Spinner className="size-5" />
          {job.stage === "concepts" ? "Making concepts…" : "Building the 3D model…"}
        </div>
      ) : null}

      {job.status === "concepts_ready" ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">Pick a concept to turn into a model</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {job.concepts.map((concept, index) => (
              <button
                key={concept.id}
                type="button"
                data-testid="concept"
                aria-pressed={selected === concept.id}
                aria-label={`Concept ${index + 1}`}
                onClick={() => setSelected(concept.id)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-xl border-2 bg-muted transition-colors",
                  selected === concept.id ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <img src={`/files/concepts/${concept.id}`} alt="" className="size-full object-cover" />
                {selected === concept.id ? (
                  <span className="absolute top-2 right-2 rounded-full bg-primary p-1 text-primary-foreground">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="pick-concept"
              disabled={!selected}
              pending={pending === "pick"}
              onClick={() =>
                void act("pick", () => pickConcept({ data: { id, conceptId: selected! } }))
              }
            >
              Use this concept
            </Button>
            <Button
              variant="outline"
              data-testid="regenerate"
              pending={pending === "regenerate"}
              onClick={() => void act("regenerate", () => regenerateConcepts({ data: { id } }))}
            >
              <RotateCcw aria-hidden /> Try again
            </Button>
            <Button
              variant="ghost"
              data-testid="discard"
              pending={pending === "discard"}
              onClick={() =>
                void act("discard", async () => {
                  await discardJob({ data: { id } });
                  await navigate({ to: "/" });
                })
              }
            >
              Discard
            </Button>
          </div>
        </section>
      ) : null}

      {job.status === "failed" ? (
        <section className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription data-testid="job-error">{job.error}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="retry"
              pending={pending === "retry"}
              onClick={() => void act("retry", () => retryJob({ data: { id } }))}
            >
              <RotateCcw aria-hidden /> Retry
            </Button>
            <Button
              variant="ghost"
              pending={pending === "discard"}
              onClick={() =>
                void act("discard", async () => {
                  await discardJob({ data: { id } });
                  await navigate({ to: "/" });
                })
              }
            >
              Discard
            </Button>
          </div>
        </section>
      ) : null}

      {job.status === "succeeded" && job.modelId ? (
        <Button
          data-testid="open-model"
          render={<Link to="/models/$id" params={{ id: job.modelId }} />}
          nativeButton={false}
        >
          Open model
        </Button>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription data-testid="form-error">{error}</AlertDescription>
        </Alert>
      ) : null}
    </AppShell>
  );
}
