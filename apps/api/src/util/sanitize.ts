export function sanitize(s: string): string {
  return s.replace(/[^\w\-. ]+/g, "_").slice(0, 120) || "stems";
}
