import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { ModelViewer } from "@/client/components/ModelViewer";
import { NotFoundState } from "@/client/components/NotFoundState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { errorMessage, formatDate, SOURCE_LABELS, STYLE_LABELS } from "@/client/lib/labels";
import { deleteModel, getModel, renameModel, shareModel } from "@/serverFunctions/models";

export const Route = createFileRoute("/models/$id")({
  loader: ({ params }) => getModel({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Model"} · Model Generator` }],
  }),
  component: ModelPage,
});

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ModelPage() {
  const model = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  if (!model)
    return (
      <AppShell nav={<AppNav />}>
        <NotFoundState what="Model" />
      </AppShell>
    );

  const id = model.id;
  const fileName = model.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model";

  async function run(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={model.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{SOURCE_LABELS[model.source]}</Badge>
            {model.style ? <span>{STYLE_LABELS[model.style] ?? model.style}</span> : null}
            <span>{formatDate(model.createdAt)}</span>
            <span>{fileSize(model.sizeBytes)}</span>
            {!model.isOwner ? (
              <span>
                by <span data-testid="owner-email">{model.ownerEmail}</span>
              </span>
            ) : null}
          </span>
        }
        actions={
          model.isOwner ? (
            <>
              <Button
                variant="outline"
                data-testid="rename"
                onClick={() => {
                  setName(model.name);
                  setRenaming(true);
                }}
              >
                <Pencil aria-hidden /> Rename
              </Button>
              <Button variant="outline" data-testid="delete" onClick={() => setDeleting(true)}>
                <Trash2 aria-hidden /> Delete
              </Button>
            </>
          ) : model.canRemove ? (
            <Button variant="outline" data-testid="delete" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden /> Remove
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <ModelViewer
          src={`/files/models/${id}/glb`}
          downloadHref={`/files/models/${id}/glb?download=1`}
          fileName={fileName}
        />
        <aside className="space-y-4">
          {model.hasImage ? (
            <img
              data-testid="source-image"
              src={`/files/models/${id}/image`}
              alt={model.source === "image" ? "The image it was made from" : "The chosen concept"}
              className="aspect-square w-full rounded-xl border border-border bg-muted object-cover"
            />
          ) : null}
          {model.prompt ? (
            <p data-testid="model-prompt" className="text-sm">
              {model.prompt}
            </p>
          ) : null}
          {model.isOwner ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <Label htmlFor="share-toggle">Shared with the team</Label>
              <Switch
                id="share-toggle"
                data-testid="share-toggle"
                checked={model.shared}
                disabled={pending}
                onCheckedChange={(shared) =>
                  void run(async () => {
                    await shareModel({ data: { id, shared } });
                    await router.invalidate();
                  })
                }
              />
            </div>
          ) : null}
        </aside>
      </div>

      <Dialog open={renaming} onOpenChange={(open) => !pending && setRenaming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename model</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void run(async () => {
                await renameModel({ data: { id, name: name.trim() } });
                await router.invalidate();
                setRenaming(false);
              });
            }}
          >
            <Input
              aria-label="Name"
              data-testid="rename-input"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit" pending={pending} disabled={!name.trim()} data-testid="rename-save">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {deleting ? (
        <ConfirmDialog
          title={model.isOwner ? `Delete "${model.name}"?` : `Remove "${model.name}"?`}
          confirmLabel={model.isOwner ? "Delete" : "Remove"}
          destructive
          pending={pending}
          onConfirm={() =>
            void run(async () => {
              await deleteModel({ data: { id } });
              await navigate({ to: "/" });
            }).then((done) => done || setDeleting(false))
          }
          onClose={() => setDeleting(false)}
        >
          The model and its files are deleted for good.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
