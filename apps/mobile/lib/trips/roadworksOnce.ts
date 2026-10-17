// "Roadworks on your route" on a saved trip: fetch once per trip, after the
// trip shows. The trip is marked as asked only when an answer arrives, so an
// early tap on Edit (which leaves the summary and cancels the request) does
// not stop it running again when the driver comes back. Errors stay silent
// and are tried again next time.

import type { TripRoadworksResponse } from "@mileclear/shared";

export function fetchRoadworksOnce(args: {
  id: string;
  asked: { current: string | null };
  fetch: (id: string) => Promise<TripRoadworksResponse>;
  onResult: (data: TripRoadworksResponse["data"]) => void;
}): () => void {
  const { id, asked } = args;
  if (asked.current === id) return () => {};
  let cancelled = false;
  args
    .fetch(id)
    .then((res) => {
      if (cancelled) return;
      asked.current = id;
      args.onResult(res.data);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}
