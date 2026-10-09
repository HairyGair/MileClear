"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SavedLocation } from "@mileclear/shared";
import { api } from "../../../lib/api";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { MapView } from "./MapView";
import { cx } from "./cx";

export interface PlaceValue {
  label: string;
  lat?: number;
  lng?: number;
}

interface Option {
  key: string;
  primary: string;
  secondary?: string;
  kind: "saved" | "google" | "search";
  placeId?: string;
  lat?: number;
  lng?: number;
}

function newSession(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

/**
 * Address picker: saved places first, then our /geocode/autocomplete, then
 * "Pick on map". Only our API is called (no postcodes.io or Nominatim).
 * Text typed but not picked is passed on as a label with no coordinates.
 *
 *   <PlaceField label="From" value={from} onChange={setFrom} savedPlaces={places} allowMap />
 */
export function PlaceField({
  label,
  value,
  onChange,
  savedPlaces = [],
  allowMap = true,
}: {
  label: string;
  value: PlaceValue | null;
  onChange: (v: PlaceValue | null) => void;
  savedPlaces?: SavedLocation[];
  allowMap?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const session = useRef(newSession());
  const seq = useRef(0);

  useEffect(() => {
    setText(value?.label ?? "");
  }, [value?.label]);

  function search(q: string) {
    const mine = ++seq.current;
    const needle = q.trim().toLowerCase();
    const saved: Option[] = savedPlaces
      .filter((p) => needle.length === 0 || p.name.toLowerCase().includes(needle))
      .slice(0, 4)
      .map((p) => ({ key: `s-${p.id}`, primary: p.name, secondary: "Saved place", kind: "saved", lat: p.latitude, lng: p.longitude }));
    setOptions(saved);
    if (q.trim().length < 2) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<{ data: { placeId: string; primary: string; secondary: string }[] }>(
          `/geocode/autocomplete?q=${encodeURIComponent(q.trim())}&session=${session.current}`
        );
        if (mine !== seq.current) return;
        let google: Option[] = (res.data ?? []).map((p) => ({
          key: `g-${p.placeId}`, primary: p.primary, secondary: p.secondary, kind: "google", placeId: p.placeId,
        }));
        if (google.length === 0) {
          const r2 = await api.get<{ data: { lat: number; lng: number; address: string }[] }>(
            `/geocode/search?q=${encodeURIComponent(q.trim())}`
          );
          if (mine !== seq.current) return;
          google = (r2.data ?? []).map((s, i) => ({ key: `n-${i}`, primary: s.address, kind: "search", lat: s.lat, lng: s.lng }));
        }
        setOptions([...saved, ...google]);
      } catch {
        // Keep the saved places. A typed address is still accepted as text.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }

  async function pick(o: Option) {
    setOpen(false);
    if (o.kind === "google" && o.placeId) {
      try {
        const res = await api.get<{ data: { lat: number; lng: number; address: string } }>(
          `/geocode/place?placeId=${encodeURIComponent(o.placeId)}&session=${session.current}`
        );
        session.current = newSession();
        const label = o.secondary ? `${o.primary}, ${o.secondary}` : o.primary;
        setText(label);
        onChange({ label, lat: res.data.lat, lng: res.data.lng });
        return;
      } catch {
        setText(o.primary);
        onChange({ label: o.primary });
        return;
      }
    }
    setText(o.primary);
    onChange({ label: o.primary, lat: o.lat, lng: o.lng });
  }

  return (
    <div className="mc-field mc-place">
      <label className="mc-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="mc-input"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        onFocus={() => {
          setOpen(true);
          search(text);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          onChange(v.trim() ? { label: v } : null);
          search(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && options.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="mc-place__list">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected="false">
              <button type="button" className="mc-place__opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                <span className="mc-place__primary">{o.primary}</span>
                {o.secondary && <span className="mc-place__secondary">{o.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {allowMap && (
        <button type="button" className={cx("mc-textlink", "mc-place__map")} onClick={() => setMapOpen(true)}>
          Pick on map
        </button>
      )}
      <Dialog
        open={mapOpen}
        title="Pick on map"
        size="lg"
        onClose={() => setMapOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMapOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!pin}
              onClick={() => {
                if (pin) {
                  const label = "Pin on map";
                  setText(label);
                  onChange({ label, lat: pin.lat, lng: pin.lng });
                }
                setMapOpen(false);
              }}
            >
              Use this spot
            </Button>
          </>
        }
      >
        <MapView height={360} onClick={(lat, lng) => setPin({ lat, lng })} markers={pin ? [{ ...pin, kind: "place" }] : []} fitTo="markers" />
      </Dialog>
    </div>
  );
}
