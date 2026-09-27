import { describe, expect, it, vi } from "vitest";
import { acknowledgeSubscriptionTolerant, isAcknowledgeConflict } from "../../services/googlePlayBilling.js";

const CONFLICT = new Error(
  'Play API /applications/com.mileclear.app/purchases/subscriptions/premium/tokens/t:acknowledge failed (409): {"error":{"code":409,"message":"The operation could not be performed since the object was already in the process of being updated."}}',
);
const pending = { acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" } as never;
const done = { acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" } as never;
const noWait = () => Promise.resolve();

describe("acknowledgeSubscriptionTolerant", () => {
  it("acknowledges a new purchase", async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    await expect(acknowledgeSubscriptionTolerant("t", pending, { acknowledge, wait: noWait })).resolves.toBe("acknowledged");
    expect(acknowledge).toHaveBeenCalledOnce();
  });

  it("skips a purchase Google already shows as acknowledged", async () => {
    const acknowledge = vi.fn();
    await expect(acknowledgeSubscriptionTolerant("t", done, { acknowledge })).resolves.toBe("already");
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("treats Krzysztof Golas's duplicate (409 while the first request acknowledges) as success once a re-read confirms it", async () => {
    const acknowledge = vi.fn().mockRejectedValue(CONFLICT);
    const refetch = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(done);
    await expect(acknowledgeSubscriptionTolerant("t", pending, { acknowledge, refetch, wait: noWait })).resolves.toBe("already");
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("still fails if a 409 never turns into an acknowledged purchase, so it cannot be left to auto-refund", async () => {
    const acknowledge = vi.fn().mockRejectedValue(CONFLICT);
    const refetch = vi.fn().mockResolvedValue(pending);
    await expect(acknowledgeSubscriptionTolerant("t", pending, { acknowledge, refetch, wait: noWait })).rejects.toBe(CONFLICT);
  });

  it("passes any other error straight through", async () => {
    const other = new Error("Play API /x:acknowledge failed (401): unauthorised");
    const acknowledge = vi.fn().mockRejectedValue(other);
    expect(isAcknowledgeConflict(other)).toBe(false);
    await expect(acknowledgeSubscriptionTolerant("t", pending, { acknowledge, wait: noWait })).rejects.toBe(other);
  });
});
