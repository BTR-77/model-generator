export const STYLE_LABELS: Record<string, string> = {
  realistic: "Realistic",
  cartoon: "Cartoon",
  sculpture: "Clay sculpture",
  "low-poly": "Low-poly",
};

export const SOURCE_LABELS: Record<string, string> = {
  text: "Text",
  image: "Image",
  import: "Import",
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "That didn't work. Try again.";
}
