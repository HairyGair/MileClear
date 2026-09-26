import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() }, Linking: { openURL: vi.fn() } }));

import { isConnectionError } from "../support";

describe("isConnectionError", () => {
  it("recognises the ways a phone reports it could not reach the server", () => {
    expect(isConnectionError("Network request failed")).toBe(true);
    expect(isConnectionError("TypeError: Failed to fetch")).toBe(true);
    expect(isConnectionError("The network connection was lost.")).toBe(true);
    expect(isConnectionError("The Internet connection appears to be offline.")).toBe(true);
    expect(isConnectionError("The request timed out.")).toBe(true);
  });

  it("leaves real server errors to the support alert", () => {
    expect(isConnectionError("Registration plate already exists")).toBe(false);
    expect(isConnectionError("Failed to save vehicle.")).toBe(false);
    expect(isConnectionError("Vehicle limit reached on the free plan")).toBe(false);
  });
});
