"use client";

import { PracticeShell } from "../../../components/practice/PracticeShell";

export default function PracticePortalLayout({ children }: { children: React.ReactNode }) {
  return <PracticeShell>{children}</PracticeShell>;
}
