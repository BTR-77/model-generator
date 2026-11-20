import { env } from "cloudflare:workers";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MODEL_BYTES = 50 * 1024 * 1024;

export class UserError extends Error {}

/** The image's type from its first bytes, or null when it isn't PNG, JPEG or WEBP. */
export function imageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** A binary glTF (.glb) starts with "glTF" and version 2. */
export function isGlb(bytes: Uint8Array): boolean {
  return (
    bytes.length > 20 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "glTF" &&
    bytes[4] === 2
  );
}

export async function readImageUpload(file: unknown): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  if (!(file instanceof File) || file.size === 0)
    throw new UserError("Choose an image.");
  if (file.size > MAX_IMAGE_BYTES)
    throw new UserError("Images can be at most 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = imageType(bytes);
  if (!contentType) throw new UserError("Use a PNG, JPG or WEBP image.");
  return { bytes, contentType };
}

export async function readModelUpload(file: unknown): Promise<Uint8Array> {
  if (!(file instanceof File) || file.size === 0)
    throw new UserError("Choose a .glb file.");
  if (file.size > MAX_MODEL_BYTES)
    throw new UserError("Models can be at most 50 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isGlb(bytes)) throw new UserError("That file isn't a GLB model.");
  return bytes;
}

export function putFile(key: string, bytes: Uint8Array, contentType: string) {
  return env.files.put(key, bytes, { httpMetadata: { contentType } });
}

export async function deleteFiles(keys: (string | null | undefined)[]) {
  const unique = [...new Set(keys.filter((key): key is string => !!key))];
  if (unique.length) await env.files.delete(unique);
}

/** Streams a stored file, or 404. */
export async function serveFile(
  key: string | null | undefined,
  options: { download?: string } = {},
): Promise<Response> {
  if (!key) return notFound();
  const object = await env.files.get(key);
  if (!object) return notFound();
  const headers = new Headers({
    "content-type":
      object.httpMetadata?.contentType ?? "application/octet-stream",
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  });
  if (options.download)
    headers.set(
      "content-disposition",
      `attachment; filename="${options.download.replace(/[^\w.-]+/g, "-")}"`,
    );
  return new Response(object.body, { headers });
}

export const notFound = () => new Response("Not found", { status: 404 });

/** "Brass lantern" → "brass-lantern". */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "model"
  );
}
