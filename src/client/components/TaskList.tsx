import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  isRunning,
  JobStatusBadge,
  type JobStatus,
} from "@/client/components/JobStatusBadge";
import { formatDate } from "@/client/lib/labels";

interface Task {
  id: string;
  name: string;
  kind: "text" | "image";
  status: JobStatus;
  error: string | null;
  createdAt: string;
}

/** Re-reads the page's data every few seconds while `active`. */
export function usePolling(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void router.invalidate(), 2500);
    return () => clearInterval(timer);
  }, [active, router]);
}

/** The member's jobs that are running, waiting on a pick, or failed. */
export function TaskList({ tasks }: { tasks: Task[] }) {
  usePolling(tasks.some((task) => isRunning(task.status)));
  if (!tasks.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Jobs</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {tasks.map((task) => (
          <li
            key={task.id}
            data-testid="task-row"
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <Link
                to="/jobs/$id"
                params={{ id: task.id }}
                data-testid="open-task"
                className="block truncate text-sm font-medium hover:underline"
              >
                {task.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {task.status === "failed" && task.error
                  ? task.error
                  : `${task.kind === "text" ? "From text" : "From image"} · ${formatDate(task.createdAt)}`}
              </p>
            </div>
            <JobStatusBadge status={task.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
