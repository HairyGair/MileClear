interface SkeletonProps {
  variant?: "text" | "title" | "card" | "row";
  count?: number;
  style?: React.CSSProperties;
}

export function LoadingSkeleton({ variant = "text", count = 1, style }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton skeleton--${variant}`} style={style} />
      ))}
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="skeleton skeleton--title" style={{ width: "30%" }} />
      <div className="skeleton skeleton--text" style={{ width: "50%" }} />
      <div className="skeleton skeleton--card" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="skeleton skeleton--card" style={{ height: 90 }} />
        <div className="skeleton skeleton--card" style={{ height: 90 }} />
        <div className="skeleton skeleton--card" style={{ height: 90 }} />
        <div className="skeleton skeleton--card" style={{ height: 90 }} />
      </div>
      <div className="skeleton skeleton--card" style={{ height: 200 }} />
    </div>
  );
}
