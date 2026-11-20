import { Badge } from "@/client/components/ui/badge";
import { Spinner } from "@/client/components/ui/spinner";

export type JobStatus =
  | "queued"
  | "concepts_ready"
  | "generating"
  | "succeeded"
  | "failed";

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  concepts_ready: "Concepts ready",
  generating: "Generating model",
  succeeded: "Succeeded",
  failed: "Failed",
};

export const isRunning = (status: JobStatus) =>
  status === "queued" || status === "generating";

export function JobStatusBadge({
  status,
  testId,
}: {
  status: JobStatus;
  testId?: string;
}) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "succeeded"
        ? "success"
        : status === "concepts_ready"
          ? "warning"
          : "secondary";
  return (
    <Badge variant={variant} className="gap-1.5">
      {isRunning(status) ? <Spinner className="size-3" /> : null}
      <span data-testid={testId}>{STATUS_LABELS[status]}</span>
    </Badge>
  );
}
