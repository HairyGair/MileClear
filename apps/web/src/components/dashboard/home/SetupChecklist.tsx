"use client";

import { api } from "../../../lib/api";
import { useData } from "../../../lib/dashboard/useData";
import { useMe } from "../../../lib/dashboard/useMe";
import { Card } from "../kit/Card";
import { SettingsRow } from "../kit/Settings";
import type { IconName } from "../kit/Icon";

/** Only what is left to do. Renders nothing once everything is done. */
export function SetupChecklist() {
  const { user } = useMe();
  const vehicles = useData("setup-vehicles", () => api.get<{ data: unknown[] }>("/vehicles"));
  const trips = useData("setup-trips", () => api.get<{ data: unknown[]; total?: number }>("/trips?pageSize=1"));

  if (vehicles.loading || trips.loading || vehicles.error || trips.error) return null;

  const todo: { icon: IconName; label: string; hint: string; href: string; external?: boolean }[] = [];
  if ((vehicles.data?.data ?? []).length === 0) {
    todo.push({ icon: "car-outline", label: "Add your vehicle", hint: "We use it for the right mileage rate.", href: "/dashboard/vehicles/new" });
  }
  const tripCount = trips.data?.total ?? trips.data?.data?.length ?? 0;
  if (tripCount === 0) {
    todo.push({ icon: "phone-portrait-outline", label: "Install the app and record a first trip", hint: "Trips record by themselves on your phone.", href: "/app", external: true });
  }
  if (!user?.workType) {
    todo.push({ icon: "briefcase-outline", label: "Tell us how you work", hint: "Gig, employee or both.", href: "/dashboard/settings/work-tax" });
  }
  if (todo.length === 0) return null;

  return (
    <div data-tour="home-setup">
    <Card title="Get set up" padded={false}>
      <div className="mc-checklist">
        {todo.map((t) => (
          <SettingsRow key={t.label} icon={t.icon} label={t.label} hint={t.hint} href={t.href} external={t.external} />
        ))}
      </div>
    </Card>
    </div>
  );
}
