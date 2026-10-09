"use client";

import { useRef } from "react";
import { MAX_SCREENSHOTS, readScreenshots, type PickedScreenshot } from "@/components/support/screenshots";
import styles from "./feedback.module.css";

// Up to three screenshots for a report or a reply (JPEG or PNG, 1.5 MB each).
export function ScreenshotPicker({
  shots,
  onChange,
  onProblem,
  disabled,
}: {
  shots: PickedScreenshot[];
  onChange: (next: PickedScreenshot[]) => void;
  onProblem: (msg: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { picked, problem } = await readScreenshots(files, shots.length);
    onChange([...shots, ...picked]);
    onProblem(problem);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={styles.shots}>
      {shots.map((s, i) => (
        <div key={`${s.name}-${i}`} className={styles.shot}>
          <img src={s.preview} alt={`Screenshot ${i + 1}`} />
          <button
            type="button"
            className={styles.shotRemove}
            aria-label={`Remove screenshot ${i + 1}`}
            disabled={disabled}
            onClick={() => onChange(shots.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      {shots.length < MAX_SCREENSHOTS && (
        <label className={styles.shotAdd}>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png" multiple disabled={disabled} onChange={(e) => void onFiles(e.target.files)} />
          Add a screenshot
        </label>
      )}
    </div>
  );
}
