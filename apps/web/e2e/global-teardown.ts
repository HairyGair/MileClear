import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// The second dev server (NZ homepage redirect on, NEXT_DIST_DIR=.next-e2e-nz)
// rewrites next-env.d.ts to point at its own build folder when it starts.
// Put the main build folder back so a local run leaves the tree clean.
export default function globalTeardown() {
  const file = resolve(__dirname, "../next-env.d.ts");
  const text = readFileSync(file, "utf8");
  const fixed = text.replace("./.next-e2e-nz/types/", "./.next/types/");
  if (fixed !== text) writeFileSync(file, fixed);
}
