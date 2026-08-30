// Render the current "Latest" Product Update email to an HTML file so it can
// be opened in a browser exactly as recipients will see it. Read-only, no send.
//
//   npx tsx apps/api/scripts/preview-update-email.ts [outfile]
import "dotenv/config";
import { writeFileSync } from "fs";
import { renderUpdateEmailPreview } from "../src/services/email.js";

const preview = renderUpdateEmailPreview();
if (!preview) {
  console.error("No release marked 'Latest' in RELEASE_NOTES.");
  process.exit(1);
}
const out = process.argv[2] || "/tmp/mileclear-update-email.html";
writeFileSync(out, preview.html);
console.log(`Subject: ${preview.subject}`);
console.log(`Written: ${out}`);
