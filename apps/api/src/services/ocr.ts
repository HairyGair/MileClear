// Server-side OCR fallback (Google Cloud Vision API)

export async function processEarningsScreenshot(
  _imageBuffer: Buffer
): Promise<{ platform: string; amount: number } | null> {
  // TODO: integrate with Google Cloud Vision API
  return null;
}
