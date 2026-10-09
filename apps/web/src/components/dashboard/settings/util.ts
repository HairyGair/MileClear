/** The message to show for a failed request: the API's own sentence if it sent one. */
export function errMsg(e: unknown, fallback = "Couldn't save. Try again."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Unwrap `{ data: T }` or a bare `T`. */
export function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | T;
  return (r && typeof r === "object" && "data" in (r as object) ? (r as { data: T }).data : (r as T)) as T;
}
