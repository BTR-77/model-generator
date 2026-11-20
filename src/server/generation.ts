import { env } from "cloudflare:workers";
import { integrationFetch, integrationStatus } from "@every-app/sdk/server";

// The models the generation service runs.
const CONCEPT_MODEL =
  "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions";
const MESH_MODEL_VERSION =
  "firtoz/trellis:e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c";
const PREDICTIONS = "https://api.replicate.com/v1/predictions";

export const STYLES = ["realistic", "cartoon", "sculpture", "low-poly"] as const;
export type Style = (typeof STYLES)[number];

const STYLE_PROMPTS: Record<Style, string> = {
  realistic: "photorealistic product render, physically based materials",
  cartoon: "stylized cartoon 3D art, bold simple shapes, vibrant colors",
  sculpture: "untextured matte gray clay sculpture, no color",
  "low-poly": "low-poly faceted game asset, flat shaded",
};

export interface Prediction {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
}

export async function generationReady(): Promise<boolean> {
  const status = await integrationStatus({ env, provider: "replicate" });
  return status.ready;
}

export function conceptRequest(prompt: string, style: Style, count: number) {
  return {
    url: CONCEPT_MODEL,
    body: {
      input: {
        prompt: `${prompt}. ${STYLE_PROMPTS[style]}. One object, centered, whole object in view, plain light background, no text.`,
        num_outputs: count,
        aspect_ratio: "1:1",
        output_format: "png",
      },
    },
  };
}

export function meshRequest(imageUrl: string) {
  return {
    url: PREDICTIONS,
    body: {
      version: MESH_MODEL_VERSION,
      input: {
        images: [imageUrl],
        texture_size: 1024,
        mesh_simplify: 0.95,
        generate_model: true,
        generate_color: false,
        save_gaussian_ply: false,
      },
    },
  };
}

/** Starts a run; the service reports the result to `webhook`. */
export async function startPrediction(
  request: { url: string; body: Record<string, unknown> },
  webhook: string,
): Promise<Prediction> {
  const call = integrationFetch({ env, provider: "replicate" });
  const response = await call(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...request.body,
      webhook,
      webhook_events_filter: ["completed"],
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    if (body.code === "integration_not_configured")
      return { status: "failed", error: "Generation isn't set up." };
    const detail = body.detail ?? body.message ?? body.error;
    return {
      status: "failed",
      error:
        typeof detail === "string" && detail
          ? detail
          : `The generation service answered ${response.status}.`,
    };
  }
  return body as Prediction;
}

export function failureReason(prediction: Prediction): string {
  if (typeof prediction.error === "string" && prediction.error)
    return prediction.error.slice(0, 500);
  if (prediction.status === "canceled") return "The run was canceled.";
  return "The generation service couldn't finish this run.";
}

/** Output URLs from a finished run, in order. */
export function outputUrls(output: unknown): string[] {
  if (typeof output === "string") return [output];
  if (Array.isArray(output))
    return output.filter((item): item is string => typeof item === "string");
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.model_file === "string") return [record.model_file];
    return Object.values(record).filter(
      (value): value is string =>
        typeof value === "string" && /\.glb(\?|$)/.test(value),
    );
  }
  return [];
}

/** Fetches an output file: a data: URL, or one on the service's file hosts. */
export async function fetchOutput(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!match) throw new Error("Unreadable output.");
    const data = match[2]
      ? Uint8Array.from(atob(match[3]!), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]!));
    return { bytes: data, contentType: match[1] ?? "application/octet-stream" };
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !/(^|\.)replicate\.(delivery|com)$/.test(parsed.hostname)
  )
    throw new Error("Output from an unexpected host.");
  const response = await fetch(parsed);
  if (!response.ok) throw new Error(`Couldn't fetch the output (${response.status}).`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}
