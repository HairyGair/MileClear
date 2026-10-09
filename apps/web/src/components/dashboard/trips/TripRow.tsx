"use client";

import Link from "next/link";
import { Button, Icon, StatusChip } from "../kit";
import { formatMiles, formatTime } from "../../../lib/dashboard";
import { CLASSIFICATION_WORD, type TripItem } from "./lib/types";
import { canUndoAuto, platformLabel } from "./lib/labels";
import { tripEndLabel, type PlaceCircle } from "./lib/placeLabel";
import "./trips.css";

export interface TripRowProps {
  trip: TripItem;
  places: PlaceCircle[];
  showPlatform: boolean;
  /** The trip this one may be a copy of, when it is on screen. */
  duplicateOther: TripItem | null;
  duplicateBelow: boolean;
  busy: boolean;
  onUndoAuto: (trip: TripItem) => void;
  onMerge: (trip: TripItem, other: TripItem) => void;
  onKeepBoth: (trip: TripItem) => void;
}

const CHECK_HINT = "MileClear is less sure whether this was business or personal. Open the trip to check it.";

/** One trip in the list. The row opens the trip; the small actions underneath never navigate. */
export function TripRow({
  trip,
  places,
  showPlatform,
  duplicateOther,
  duplicateBelow,
  busy,
  onUndoAuto,
  onMerge,
  onKeepBoth,
}: TripRowProps) {
  const from = tripEndLabel(trip.startAddress, trip.startLat, trip.startLng, places) || "Start";
  const to = tripEndLabel(trip.endAddress, trip.endLat, trip.endLng, places) || "End";
  const word = CLASSIFICATION_WORD[trip.classification];
  const hasNote = !!trip.notes && trip.notes.trim().length > 0;
  const level = trip.confidence?.level;
  const check = level === "low";
  const platform = showPlatform && trip.classification === "business" ? platformLabel(trip.platformTag) : "";
  const times = trip.endedAt ? `${formatTime(trip.startedAt)} to ${formatTime(trip.endedAt)}` : formatTime(trip.startedAt);
  const undo = canUndoAuto(trip);

  return (
    <li className="mc-trip" data-testid="trip-row">
      <Link href={`/dashboard/trips/${trip.id}`} className="mc-trip__main">
        <span className="mc-trip__route">
          {from}
          <span className="mc-trip__arrow" aria-hidden="true">
            →
          </span>
          <span className="mc-sr-only"> to </span>
          {to}
        </span>
        <span className="mc-trip__miles mc-num">{formatMiles(trip.distanceMiles)}</span>
        <span className="mc-trip__meta">
          <span className="mc-num">{times}</span>
          <span className={trip.classification === "unclassified" ? "mc-trip__word mc-trip__word--unsorted" : "mc-trip__word"}>
            {word}
          </span>
          {platform && <span>{platform}</span>}
          {hasNote && (
            <span className="mc-trip__note" title="Has a note">
              <Icon name="chatbubble-outline" size={14} />
              <span className="mc-sr-only">Has a note</span>
            </span>
          )}
          {check && (
            <span title={CHECK_HINT} className="mc-trip__check">
              <StatusChip tone="amber" label="Check this" />
              <span className="mc-sr-only">. {CHECK_HINT}</span>
            </span>
          )}
        </span>
      </Link>
      {(undo || trip.possibleDuplicateOfId) && (
        <div className="mc-trip__extras">
          {undo && (
            <>
              <span>Sorted automatically.</span>
              <Button variant="link" size="sm" disabled={busy} onClick={() => onUndoAuto(trip)}>
                Undo
              </Button>
            </>
          )}
          {trip.possibleDuplicateOfId && (
            <>
              <span>
                {duplicateOther
                  ? `Looks like a copy of the trip ${duplicateBelow ? "below" : "above"}.`
                  : "Looks like a copy of another trip."}
              </span>
              {duplicateOther && (
                <Button variant="secondary" size="sm" loading={busy} onClick={() => onMerge(trip, duplicateOther)}>
                  Merge
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onKeepBoth(trip)}>
                Keep both
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
