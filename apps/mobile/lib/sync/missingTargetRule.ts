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
// The answer depends on what the phone still holds, and on whether the record
// ever reached the server:
//
//   delete, target gone              -> the outcome the user wanted. Drop it.
//   update, no local row either      -> both sides agree it is gone. Drop it.
//   update, local row that HAD synced -> the server removed it on purpose (a
//                                       merge, a split, a delete on the web,
//                                       a duplicate cleared by support).
//                                       Drop the edit and the stale local
//                                       copy; re-creating it would bring a
//                                       deleted trip back.
//   update, local row never synced   -> its create has not landed yet. Keep
//                                       the edit waiting behind the create
//                                       (and make sure there IS a create).
//
// Until 28 Sep 2026 the last two cases were one: "re-create", done by turning
// the queued UPDATE into a CREATE with the update's own payload ({id,
// classification}). That payload is not a trip, so POST /trips answered 400
// and the row was parked as permanently_failed, the very badge this rule was
// written to clear. For a shift it was worse: POST /shifts ignores the
// {status:"completed"} body and STARTS a new shift, which the dashboard then
// re-attaches to, muting automatic tracking.
//
// Never silently drop something only the phone has: losing a real trip is far
// worse than a stuck queue row, which is the rule the whole sync engine is
// built on. A never-synced trip is only ever deferred, never dropped.

export type MissingTargetAction = "drop" | "drop_local" | "await_create";

export interface MissingTargetInput {
  action: "create" | "update" | "delete";
  /** Does the row still exist in local SQLite? */
  localRowExists: boolean;
  /** Has the local row been confirmed by the server (synced_at set)? Only
   *  meaningful when localRowExists. */
  localRowSynced?: boolean;
}

export function resolveMissingTarget(input: MissingTargetInput): MissingTargetAction | null {
  const { action, localRowExists, localRowSynced } = input;
  // A create cannot 404 on its own target; leave that to the existing paths.
  if (action === "create") return null;
  if (action === "delete") return "drop";
  if (!localRowExists) return "drop";
  return localRowSynced ? "drop_local" : "await_create";
}
