"use client";

import { useParams } from "next/navigation";
import { PracticeLanding } from "../../../../components/practice/PracticeLanding";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  return <PracticeLanding kind="code" value={(params?.code ?? "").toUpperCase()} />;
}
