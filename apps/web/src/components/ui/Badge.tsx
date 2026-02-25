interface BadgeProps {
  variant?: "business" | "personal" | "pro" | "source" | "success" | "danger" | "primary" | "coming-soon";
  children: React.ReactNode;
}

export function Badge({ variant = "source", children }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
