/** Normalizes Apps Script pathInfo without relying on query-string routing. */
export function parsePathInfo(pathInfo: string | undefined): string {
  const trimmed = (pathInfo ?? "").replace(/^\/+|\/+$/g, "");
  return `/${trimmed}`;
}
