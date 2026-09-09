// Shared tone vocabulary for admin stat tiles, pills and dots. Keeping this
// in one place means a page can pick "bad" for an alarming number and every
// shared component renders it the same shade of red.
export type AdminTone = "neutral" | "good" | "warn" | "bad" | "accent";
