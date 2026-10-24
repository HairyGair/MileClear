// Know which car I'm in from its Bluetooth (24 Oct 2026): who has it.
//
// Anthony approved a tester rollout. Same shape as Directions
// (services/navigation.ts): the app reads `carBluetooth` from /user/profile,
// caches it on the phone, and with it false the feature is completely inert
// (no card, no question, nothing recorded).
//
// CAR_BLUETOOTH_ROLLOUT: "off" (default, nobody), "list" (admins +
// CAR_BLUETOOTH_USER_IDS, comma separated), "all" (everyone).

export type CarBluetoothRollout = "off" | "list" | "all";

export function carBluetoothRollout(env: NodeJS.ProcessEnv = process.env): CarBluetoothRollout {
  const r = env.CAR_BLUETOOTH_ROLLOUT;
  return r === "list" || r === "all" ? r : "off";
}

export function carBluetoothEnabledFor(
  user: { id: string; isAdmin: boolean },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const rollout = carBluetoothRollout(env);
  if (rollout === "off") return false;
  if (rollout === "all" || user.isAdmin) return true;
  const ids = (env.CAR_BLUETOOTH_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(user.id);
}
