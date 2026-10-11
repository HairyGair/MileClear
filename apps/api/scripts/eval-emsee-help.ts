/**
 * Live eval: ask EmSee every question in the help question bank on the demo
 * account and score the answers against the facts each must contain.
 *
 * Safe by construction:
 *   - message_the_team NEVER runs: a stub answers it, and calling it at all
 *     counts as a failure (every bank question is a how-to).
 *   - Only read-only tools run for real (help, trips, figures, account).
 *   - Nothing is written to the database; questions are not logged as usage.
 *
 * Bundle (the server's @mileclear/shared may be older than this branch, so it
 * is inlined; everything else stays external):
 *   npx esbuild scripts/eval-emsee-help.ts --bundle --platform=node --format=esm \
 *     --packages=external --alias:@mileclear/shared=../../packages/shared/dist/index.js \
 *     --outfile=dist-eval/eval.mjs
 * Run on the server from ~/mileclear-app/apps/api, then delete dist-eval:
 *   node --env-file=/home/mileclear/mileclear-app/.env dist-eval/eval.mjs [onlyFailedFrom.json] > eval-out.json
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma.js";
import { runAssistant } from "../src/services/assistant.js";
import { runAssistantTool } from "../src/services/assistantTools.js";
import { QUESTION_BANK, type BankQuestion } from "../src/__tests__/services/helpQuestionBank.js";

const DEMO_EMAIL = "demo@mileclear.com";
const CONCURRENCY = 4;

interface Row {
  q: string;
  id: string;
  pass: boolean;
  problems: string[];
  answer: string;
  tools: string[];
  outcome: string;
}

const safeRunTool: typeof runAssistantTool = async (userId, name, input, now) => {
  if (name === "message_the_team") {
    return { ok: true, content: JSON.stringify({ sent: false, note: "Eval run: nothing was sent." }), period: null };
  }
  return runAssistantTool(userId, name, input, now);
};

function score(b: BankQuestion, answer: string, tools: string[], outcome: string): string[] {
  const problems: string[] = [];
  if (outcome !== "answered") problems.push(`outcome ${outcome}`);
  if (!b.toolOptional && !tools.includes("mileclear_help")) problems.push("did not look it up with mileclear_help");
  if (tools.includes("message_the_team")) problems.push("tried to message the team");
  for (const re of b.expect) if (!re.test(answer)) problems.push(`missing ${re}`);
  for (const re of b.reject ?? []) if (re.test(answer)) problems.push(`says ${re}`);
  if (/[–—]/.test(answer)) problems.push("dash");
  if (/HMRC[- ](ready|approved|compliant|recognised)/i.test(answer)) problems.push("HMRC adjective");
  return problems;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!user) throw new Error("demo account not found");
  const only = process.argv[2] ? new Set((JSON.parse(readFileSync(process.argv[2], "utf8")) as string[])) : null;
  const bank = only ? QUESTION_BANK.filter((b) => only.has(b.q)) : QUESTION_BANK;

  const rows: Row[] = [];
  let next = 0;
  async function worker() {
    while (next < bank.length) {
      const b = bank[next++];
      try {
        const r = await runAssistant({ userId: user!.id, question: b.q, runTool: safeRunTool });
        const problems = score(b, r.answer, r.toolCalls, r.outcome);
        rows.push({ q: b.q, id: b.id, pass: problems.length === 0, problems, answer: r.answer, tools: r.toolCalls, outcome: r.outcome });
      } catch (err) {
        rows.push({ q: b.q, id: b.id, pass: false, problems: [`error ${(err as Error).message}`], answer: "", tools: [], outcome: "error" });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const passed = rows.filter((r) => r.pass).length;
  process.stdout.write(JSON.stringify({ total: rows.length, passed, rows }, null, 1));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
