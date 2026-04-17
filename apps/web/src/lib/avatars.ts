// Web mirror of apps/mobile/components/avatars/AvatarRegistry.tsx.
// Must stay in sync with mobile: User.avatarId is a VarChar(50) keyed by
// string ids like "sedan-red" / "taxi-yellow", not numbers. Mobile was the
// first writer, so the canonical source of truth for ids is the mobile
// registry - this file mirrors it verbatim.

export interface AvatarDef {
  id: string;
  label: string;
  file: string;
}

export const AVATARS: readonly AvatarDef[] = [
  { id: "sedan-red", label: "Red Sedan", file: "/avatars/avatar-01.png" },
  { id: "suv-blue", label: "Blue SUV", file: "/avatars/avatar-02.png" },
  { id: "taxi-yellow", label: "Yellow Taxi", file: "/avatars/avatar-03.png" },
  { id: "hatchback-green", label: "Green Hatch", file: "/avatars/avatar-04.png" },
  { id: "sports-orange", label: "Sports Car", file: "/avatars/avatar-05.png" },
  { id: "muscle-purple", label: "Muscle Car", file: "/avatars/avatar-06.png" },
  { id: "convertible-pink", label: "Convertible", file: "/avatars/avatar-07.png" },
  { id: "van-white", label: "Delivery Van", file: "/avatars/avatar-08.png" },
  { id: "pickup-black", label: "Pickup Truck", file: "/avatars/avatar-09.png" },
  { id: "motorcycle-silver", label: "Motorcycle", file: "/avatars/avatar-10.png" },
  { id: "bus-red", label: "Double Decker", file: "/avatars/avatar-11.png" },
  { id: "racer-blue", label: "Racing Car", file: "/avatars/avatar-12.png" },
  { id: "schoolbus-yellow", label: "School Bus", file: "/avatars/avatar-13.png" },
  { id: "electric-green", label: "Electric Car", file: "/avatars/avatar-14.png" },
  { id: "monster-orange", label: "Monster Truck", file: "/avatars/avatar-15.png" },
  { id: "f1-teal", label: "F1 Car", file: "/avatars/avatar-16.png" },
  { id: "luxury-gold", label: "Luxury Car", file: "/avatars/avatar-17.png" },
  { id: "jeep-brown", label: "Jeep", file: "/avatars/avatar-18.png" },
  { id: "ambulance-navy", label: "Ambulance", file: "/avatars/avatar-19.png" },
  { id: "firetruck-red", label: "Fire Truck", file: "/avatars/avatar-20.png" },
  { id: "gokart-lime", label: "Go-Kart", file: "/avatars/avatar-21.png" },
  { id: "minivan-indigo", label: "Minivan", file: "/avatars/avatar-22.png" },
  { id: "scooter-rose", label: "Scooter", file: "/avatars/avatar-23.png" },
  { id: "icecream-cyan", label: "Ice Cream Van", file: "/avatars/avatar-24.png" },
  { id: "limo-magenta", label: "Limousine", file: "/avatars/avatar-25.png" },
  { id: "military-olive", label: "Military Jeep", file: "/avatars/avatar-26.png" },
  { id: "beetle-coral", label: "VW Beetle", file: "/avatars/avatar-27.png" },
  { id: "camper-turquoise", label: "Camper Van", file: "/avatars/avatar-28.png" },
  { id: "classic-maroon", label: "Classic Car", file: "/avatars/avatar-29.png" },
  { id: "tesla-electric", label: "Tesla", file: "/avatars/avatar-30.png" },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

// Resolve any stored avatarId (string key, or legacy numeric index written by
// the old web picker) to a static file path. Returns null for unknown values
// so the caller can fall back to initials.
export function resolveAvatarFile(avatarId: string | null | undefined): string | null {
  if (!avatarId) return null;
  const direct = BY_ID.get(avatarId);
  if (direct) return direct.file;
  // Legacy numeric fallback: "1".."30" or "01".."30"
  const n = Number(avatarId);
  if (Number.isInteger(n) && n >= 1 && n <= AVATARS.length) {
    return AVATARS[n - 1].file;
  }
  return null;
}
