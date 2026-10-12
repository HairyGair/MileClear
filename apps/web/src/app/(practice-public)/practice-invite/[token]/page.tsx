"use client";

import { useParams } from "next/navigation";
import { PracticeLanding } from "../../../../components/practice/PracticeLanding";

export default function PracticeInvitePage() {
  const params = useParams<{ token: string }>();
  return <PracticeLanding kind="invite" value={params?.token ?? ""} />;
}
