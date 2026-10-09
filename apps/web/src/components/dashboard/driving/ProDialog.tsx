"use client";

import { Button } from "../kit/Button";
import { Dialog } from "../kit/Dialog";
import { planHref, proReasonTitle, type ProReason } from "../../../lib/dashboard/proReasons";

/**
 * The upgrade dialog for a limit (second vehicle, third place). One path to Pro:
 * the plan page with the reason. Title comes from the shared reason map.
 *
 *   <ProDialog open={open} reason="vehicles" onClose={close} />
 */
export function ProDialog({
  open,
  reason,
  onClose,
  body,
}: {
  open: boolean;
  reason: ProReason;
  onClose: () => void;
  body?: string;
}) {
  return (
    <Dialog
      open={open}
      title={proReasonTitle(reason)}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button variant="primary" href={planHref(reason)}>Upgrade to Pro</Button>
        </>
      }
    >
      <p className="mc-dialog__text">{body ?? "This is part of MileClear Pro. £4.99 a month, cancel any time."}</p>
    </Dialog>
  );
}
