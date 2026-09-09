// Relative time display, ported from the ago() helper the old activation
// sub-page defined locally (apps/web/src/app/dashboard/admin/activation/page.tsx).
// Every admin page that showed a "last seen" or "last heartbeat" column
// reimplemented some version of this; this is the one copy going forward.

interface AgoProps {
  iso: string | null | undefined;
  className?: string;
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Ago({ iso, className }: AgoProps) {
  if (!iso) {
    return <span className={className}>never</span>;
  }
  const absolute = new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <span className={className} title={absolute}>
      {relativeTime(iso)}
    </span>
  );
}
