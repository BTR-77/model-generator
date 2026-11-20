import { useNavigate } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
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
import { errorMessage } from "@/client/lib/labels";
import { importModel } from "@/serverFunctions/models";

/** Adds a .glb the member already has to their library. */
export function ImportDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!file) return setError("Choose a .glb file.");
    if (file.size > 50 * 1024 * 1024)
      return setError("Models can be at most 50 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("name", name);
    setPending(true);
    try {
      const { id } = await importModel({ data: form });
      setOpen(false);
      await navigate({ to: "/models/$id", params: { id } });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" data-testid="import" onClick={() => setOpen(true)}>
        <Upload aria-hidden /> Import
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) {
            setFile(null);
            setName("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a model</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="import-file">GLB file, up to 50 MB</Label>
              <Input
                id="import-file"
                type="file"
                accept=".glb,model/gltf-binary"
                data-testid="import-file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-name">Name</Label>
              <Input
                id="import-name"
                data-testid="import-name"
                value={name}
                maxLength={120}
                placeholder={file?.name.replace(/\.glb$/i, "") ?? ""}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription data-testid="import-error">{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="submit" pending={pending} data-testid="import-submit">
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
