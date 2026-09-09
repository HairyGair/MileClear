import type { ReactNode } from "react";

interface EmptyProps {
  children?: ReactNode;
}

export function Empty({ children = "Nobody in this group right now." }: EmptyProps) {
  return <p className="admin-empty">{children}</p>;
}
