import type { SupportScreenshotUpload } from "@mileclear/shared";

// Screenshots a driver picks on the website, checked the same way the API
// checks them (docs/feedback-redesign-oct2026.md): jpeg or png, at most
// 1.5 MB each, at most 3 per message.

export const MAX_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 1.5 * 1024 * 1024;

export interface PickedScreenshot extends SupportScreenshotUpload {
  name: string;
  /** data: URL for the preview thumbnail. */
  preview: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Turn picked files into uploads. Returns the accepted screenshots and a
 * plain-words message for any that were turned away.
 */
export async function readScreenshots(
  files: FileList | File[],
  alreadyPicked: number
): Promise<{ picked: PickedScreenshot[]; problem: string | null }> {
  const picked: PickedScreenshot[] = [];
  const problems: string[] = [];
  for (const file of Array.from(files)) {
    if (alreadyPicked + picked.length >= MAX_SCREENSHOTS) {
      problems.push(`You can add up to ${MAX_SCREENSHOTS} screenshots.`);
      break;
    }
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      problems.push(`${file.name} isn't a JPEG or PNG image.`);
      continue;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      problems.push(`${file.name} is over 1.5 MB.`);
      continue;
    }
    const dataUrl = await readAsDataUrl(file);
    const comma = dataUrl.indexOf(",");
    picked.push({
      name: file.name,
      mime: file.type as SupportScreenshotUpload["mime"],
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
      preview: dataUrl,
    });
  }
  return { picked, problem: problems.length ? problems.join(" ") : null };
}

/** Strip the preview fields before sending. */
export function toUploads(shots: PickedScreenshot[]): SupportScreenshotUpload[] {
  return shots.map(({ mime, base64 }) => ({ mime, base64 }));
}
