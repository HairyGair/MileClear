"use client";

import { EmptyState, PageHeader, useMe } from "@/components/dashboard/kit";
import { BusinessProfileForm } from "@/components/dashboard/settings/BusinessProfileForm";

export default function Page() {
  const { isCompanyDriver, teamReady } = useMe();
  const back = { href: "/dashboard/settings", label: "Settings" };
  if (isCompanyDriver) {
    return (
      <>
        <PageHeader title="Business profile" back={back} />
        <EmptyState icon="business-outline" title="Your company handles this" body="Business details are for self-employed driving." />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Business profile" back={back} />
      {teamReady ? <BusinessProfileForm /> : null}
    </>
  );
}
