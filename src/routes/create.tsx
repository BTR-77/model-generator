import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImageUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ChoiceGroup } from "@/client/components/ChoiceGroup";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, STYLE_LABELS } from "@/client/lib/labels";
import { getCreatePage, startImageJob, startTextJob } from "@/serverFunctions/jobs";

export const Route = createFileRoute("/create")({
  validateSearch: z.object({ tab: z.enum(["text", "image"]).catch("text").optional() }),
  loader: () => getCreatePage(),
  head: () => ({ meta: [{ title: "Create · Model Generator" }] }),
  component: Create,
});

const STYLES = ["realistic", "cartoon", "sculpture", "low-poly"] as const;
const COUNTS = ["1", "2", "3", "4"] as const;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function Create() {
  const { ready } = Route.useLoaderData();
  const { tab = "text" } = Route.useSearch();
  const navigate = useNavigate({ from: "/create" });

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Create a model" />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          void navigate({ search: { tab: next === "image" ? "image" : undefined }, replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="text" data-testid="tab-text">
            <Sparkles aria-hidden /> From text
          </TabsTrigger>
          <TabsTrigger value="image" data-testid="tab-image">
            <ImageUp aria-hidden /> From an image
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {!ready ? (
        <div data-testid="not-configured">
          <EmptyState
            kind="error"
            title="Generation isn't set up"
            description="An admin turns it on by adding a Replicate API token to the Gateway."
          />
        </div>
      ) : tab === "image" ? (
        <ImageForm />
      ) : (
        <TextForm />
      )}
    </AppShell>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription data-testid="form-error">{error}</AlertDescription>
    </Alert>
  );
}

function TextForm() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("realistic");
  const [count, setCount] = useState<(typeof COUNTS)[number]>("4");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    const text = prompt.trim();
    if (!text) return setError("Describe the model you want.");
    setPending(true);
    try {
      const { id } = await startTextJob({ data: { prompt: text, style, count: Number(count) } });
      await navigate({ to: "/jobs/$id", params: { id } });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="prompt">Description</Label>
        <Textarea
          id="prompt"
          data-testid="prompt"
          value={prompt}
          maxLength={800}
          rows={4}
          placeholder="A weathered bronze statue of a fox sitting upright"
          onChange={(event) => setPrompt(event.target.value)}
          className="bg-card"
        />
        <p className="text-right text-xs text-muted-foreground">{prompt.length}/800</p>
      </div>
      <div className="space-y-2">
        <Label>Style</Label>
        <ChoiceGroup
          label="Style"
          testIdPrefix="style"
          value={style}
          onChange={setStyle}
          items={STYLES.map((value) => ({ value, label: STYLE_LABELS[value]! }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Concepts to choose from</Label>
        <ChoiceGroup
          label="Concepts"
          testIdPrefix="count"
          value={count}
          onChange={setCount}
          items={COUNTS.map((value) => ({ value, label: value }))}
        />
      </div>
      <FormError error={error} />
      <Button type="submit" pending={pending} data-testid="start-text">
        Generate concepts
      </Button>
    </form>
  );
}

function ImageForm() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!file) return setError("Choose an image.");
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a PNG, JPG or WEBP image.");
    if (file.size > 10 * 1024 * 1024) return setError("Images can be at most 10 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("name", name);
    setPending(true);
    try {
      const { id } = await startImageJob({ data: form });
      await navigate({ to: "/jobs/$id", params: { id } });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="image-file">Image (PNG, JPG or WEBP, up to 10 MB)</Label>
        <Input
          id="image-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-testid="image-file"
          onChange={(event) => {
            setError(null);
            setFile(event.target.files?.[0] ?? null);
          }}
          className="bg-card"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="image-name">Name</Label>
        <Input
          id="image-name"
          data-testid="image-name"
          value={name}
          maxLength={120}
          placeholder="Optional"
          onChange={(event) => setName(event.target.value)}
          className="bg-card"
        />
      </div>
      <FormError error={error} />
      <Button type="submit" pending={pending} data-testid="start-image">
        Generate model
      </Button>
    </form>
  );
}
