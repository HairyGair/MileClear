import { describe, expect, it } from "vitest";
import { carBluetoothEnabledFor, carBluetoothRollout } from "../../services/carBluetooth.js";

describe("who has car Bluetooth", () => {
  it("is off for everyone, admins too, unless switched on", () => {
    expect(carBluetoothRollout({})).toBe("off");
    expect(carBluetoothEnabledFor({ id: "u1", isAdmin: true }, {})).toBe(false);
    expect(carBluetoothEnabledFor({ id: "u1", isAdmin: true }, { CAR_BLUETOOTH_ROLLOUT: "off", CAR_BLUETOOTH_USER_IDS: "u1" })).toBe(false);
    expect(carBluetoothEnabledFor({ id: "u1", isAdmin: true }, { CAR_BLUETOOTH_ROLLOUT: "yes" })).toBe(false);
  });

  it("in the testers stage shows to admins and listed drivers only", () => {
    const env = { CAR_BLUETOOTH_ROLLOUT: "list", CAR_BLUETOOTH_USER_IDS: "u2, u3 ," };
    expect(carBluetoothEnabledFor({ id: "u1", isAdmin: true }, env)).toBe(true);
    expect(carBluetoothEnabledFor({ id: "u3", isAdmin: false }, env)).toBe(true);
    expect(carBluetoothEnabledFor({ id: "u9", isAdmin: false }, env)).toBe(false);
    expect(carBluetoothEnabledFor({ id: "u9", isAdmin: false }, { CAR_BLUETOOTH_ROLLOUT: "list" })).toBe(false);
  });

  it("shows to everyone when rolled out to all", () => {
    expect(carBluetoothEnabledFor({ id: "u9", isAdmin: false }, { CAR_BLUETOOTH_ROLLOUT: "all" })).toBe(true);
  });
});
