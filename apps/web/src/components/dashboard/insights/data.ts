import { api } from "@/lib/api";

/** GET a `{ data: T }` endpoint and return T. */
export function getData<T>(path: string): Promise<T> {
  return api.get<{ data: T }>(path).then((r) => r.data);
}
