// What to do when the server says the thing you are editing does not exist.
//
// A queued update or delete can outlive its target: the trip was removed on
// another device, or a create never landed. The server answers 404, which the
// queue treated as a malformed payload and parked as permanently_failed
// "for manual review". There is nothing to review. The row then sits in the
// queue for ever, and the Sync Status screen shows a red "Sync issues" badge
// that a driver reasonably reads as "none of my trips are saving" — 59 users
// raised that alert in the fortnight to 7 Sep 2026, Katy Moore among them,
// with one stuck item from 55 days earlier while every trip she had made was
// safely on the server.
//
// The right answer depends on what the phone still holds:
//
//   delete, target gone            -> the outcome the user wanted. Drop it.
//   update, no local row either    -> both sides agree it is gone. Drop it.
//   update, local row still here   -> the two sides have diverged and the
//                                     phone is the only place this trip
//                                     exists. Re-create it rather than
//                                     discarding the miles.
//
// Never silently drop something the phone still has: losing a real trip is
// far worse than a stuck queue row, which is the rule the whole sync engine
// is built on.

export type MissingTargetAction = "drop" | "recreate";

export interface MissingTargetInput {
  action: "create" | "update" | "delete";
  /** Does the row still exist in local SQLite? */
  localRowExists: boolean;
}

export function resolveMissingTarget(input: MissingTargetInput): MissingTargetAction | null {
  const { action, localRowExists } = input;
  // A create cannot 404 on its own target; leave that to the existing paths.
  if (action === "create") return null;
  if (action === "delete") return "drop";
  return localRowExists ? "recreate" : "drop";
}
