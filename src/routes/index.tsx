import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Box, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceGroup } from "@/client/components/ChoiceGroup";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { ImportDialog } from "@/client/components/ImportDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { TaskList } from "@/client/components/TaskList";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { errorMessage, formatDate, SOURCE_LABELS, STYLE_LABELS } from "@/client/lib/labels";
import { getTasks } from "@/serverFunctions/jobs";
import { deleteModel, getLibrary } from "@/serverFunctions/models";
import { toast } from "sonner";

const search = z.object({
  tab: z.enum(["mine", "shared"]).catch("mine").optional(),
  q: z.string().catch("").optional(),
  source: z.enum(["all", "text", "image", "import"]).catch("all").optional(),
  sort: z.enum(["newest", "oldest", "name"]).catch("newest").optional(),
  page: z.number().int().min(1).catch(1).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const input = {
      tab: deps.tab ?? "mine",
      q: deps.q ?? "",
      source: deps.source ?? "all",
      sort: deps.sort ?? "newest",
      page: deps.page ?? 1,
    };
    const [library, tasks] = await Promise.all([
      getLibrary({ data: input }),
      input.tab === "mine" ? getTasks() : Promise.resolve([]),
    ]);
    return { input, library, tasks };
  },
  head: () => ({ meta: [{ title: "Library · Model Generator" }] }),
  component: Library,
});

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
] as const;

function Library() {
  const { input, library, tasks } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();
  const [query, setQuery] = useState(input.q);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (query.trim() === input.q) return;
    const timer = setTimeout(() => {
      void navigate({
        search: (prev) => ({ ...prev, q: query.trim() || undefined, page: undefined }),
        replace: true,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, input.q, navigate]);

  const setSearch = (change: Record<string, string | number | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...change }) });

  async function remove() {
    if (!removing) return;
    setPending(true);
    try {
      await deleteModel({ data: { id: removing.id } });
      setRemoving(null);
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const shared = input.tab === "shared";

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Library"
        actions={
          <>
            <ImportDialog />
            <Button render={<Link to="/create" />} nativeButton={false}>
              <Plus aria-hidden /> Create
            </Button>
          </>
        }
      />

      {!shared ? <TaskList tasks={tasks} /> : null}

      <section className="space-y-4">
        <Tabs
          value={input.tab}
          onValueChange={(tab) =>
            setSearch({ tab: tab === "shared" ? "shared" : undefined })
          }
        >
          <TabsList>
            <TabsTrigger value="mine" data-testid="tab-mine">
              My models
            </TabsTrigger>
            <TabsTrigger value="shared" data-testid="tab-shared">
              Shared with the team
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {library.empty ? (
          <div data-testid="empty-library">
            <EmptyState
              title="No models yet"
              description="Make one from a description or a picture, or import a .glb file."
              action={
                <Button render={<Link to="/create" />} nativeButton={false}>
                  <Plus aria-hidden /> Create a model
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                data-testid="search"
                aria-label="Search"
                placeholder="Search names and prompts"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full bg-card sm:w-64"
              />
              <ChoiceGroup
                label="Source"
                testIdPrefix="filter"
                value={input.source}
                onChange={(source) =>
                  setSearch({ source: source === "all" ? undefined : source })
                }
                items={[
                  { value: "all", label: "All" },
                  { value: "text", label: "Text" },
                  { value: "image", label: "Image" },
                  { value: "import", label: "Import" },
                ]}
              />
              <Select
                value={input.sort}
                items={SORTS}
                onValueChange={(sort) =>
                  setSearch({ sort: sort === "newest" ? undefined : (sort ?? undefined) })
                }
              >
                <SelectTrigger data-testid="sort" aria-label="Sort" className="sm:ml-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((sort) => (
                    <SelectItem key={sort.value} value={sort.value}>
                      {sort.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {library.rows.length === 0 ? (
              <EmptyState
                kind="filtered"
                title={shared && !input.q && input.source === "all" ? "Nothing shared yet" : "No models match"}
              />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {library.rows.map((model) => (
                  <li
                    key={model.id}
                    data-testid="model-row"
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <Link
                      to="/models/$id"
                      params={{ id: model.id }}
                      className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      {model.hasImage ? (
                        <img
                          src={`/files/models/${model.id}/image`}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <Box className="size-5" aria-hidden />
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link
                        to="/models/$id"
                        params={{ id: model.id }}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {model.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="outline">{SOURCE_LABELS[model.source]}</Badge>
                        {model.style ? <span>{STYLE_LABELS[model.style] ?? model.style}</span> : null}
                        <span>{formatDate(model.createdAt)}</span>
                        {shared ? <span>{model.ownerEmail}</span> : null}
                        {!shared && model.shared ? <Badge variant="secondary">Shared</Badge> : null}
                      </div>
                    </div>
                    {shared && model.canRemove && !model.isOwner ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="remove-shared"
                        onClick={() => setRemoving({ id: model.id, name: model.name })}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {library.pages > 1 ? (
              <div className="flex items-center justify-between gap-2">
                <span data-testid="page-info" className="text-sm text-muted-foreground">
                  Page {library.page} of {library.pages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="prev-page"
                    disabled={library.page <= 1}
                    onClick={() =>
                      void navigate({ search: (prev) => ({ ...prev, page: library.page - 1 }) })
                    }
                  >
                    <ChevronLeft aria-hidden /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="next-page"
                    disabled={library.page >= library.pages}
                    onClick={() =>
                      void navigate({ search: (prev) => ({ ...prev, page: library.page + 1 }) })
                    }
                  >
                    Next <ChevronRight aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {removing ? (
        <ConfirmDialog
          title={`Remove "${removing.name}"?`}
          confirmLabel="Remove"
          destructive
          pending={pending}
          onConfirm={() => void remove()}
          onClose={() => setRemoving(null)}
        >
          The model and its files are deleted for its owner too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
