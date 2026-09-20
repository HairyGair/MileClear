// Outbound Slack posts via an incoming-webhook URL.
//
// Deliberately narrow. Discord's #founder carries every founder alert
// (watchdog, IAP orphans, payment failures, tester requests, feedback).
// Anthony asked (16 Sep 2026) for Slack to get just two of them: a new
// user and a new subscriber. So this module does not mirror the Discord
// channel model; it exposes one function per thing Slack is allowed to
// know about, and nothing else can post here by accident.
//
// Env: SLACK_WEBHOOK_FOUNDER (an https://hooks.slack.com/services/... URL).
// Unset = silent no-op, same as the Discord webhooks.

export interface SlackPost {
  /** Plain text fallback (notifications, search). */
  text: string;
  /** Optional Block Kit blocks for the rich layout. */
  blocks?: unknown[];
}

function webhookUrl(): string | null {
  return process.env.SLACK_WEBHOOK_FOUNDER || null;
}

/** Post to the founder Slack channel. Never throws; false when skipped or failed. */
export async function postToSlackFounder(post: SlackPost): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return false;
  const url = webhookUrl();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[slack] founder webhook returned ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[slack] founder post failed:", err);
    return false;
  }
}

function section(mrkdwn: string): unknown {
  return { type: "section", text: { type: "mrkdwn", text: mrkdwn } };
}

function context(mrkdwn: string): unknown {
  return { type: "context", elements: [{ type: "mrkdwn", text: mrkdwn }] };
}

/** Escape the three characters Slack's mrkdwn treats specially. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * "New user" mirror of the Discord founder alert. `lines` is the same
 * detail block the Discord post gets (who, platform and method, location,
 * referral), one item per line.
 */
export async function slackNewUser(args: {
  lines: string[];
  userId: string;
  link: string;
}): Promise<boolean> {
  const [who, ...rest] = args.lines.map(slackEscape);
  return postToSlackFounder({
    text: `New user: ${args.lines[0]}`,
    blocks: [
      section(`*New user*\n<${args.link}|${who}>`),
      ...(rest.length ? [context(rest.join("  ·  "))] : []),
    ],
  });
}

/**
 * "Android tester request" mirror: somebody left their email on /android
 * while the Play listing is still in review. The link goes straight to the
 * Play tester list so the address can be added without hunting for the page.
 */
export async function slackAndroidRequest(args: {
  email: string;
  driverType?: string | null;
  link: string;
}): Promise<boolean> {
  const email = slackEscape(args.email);
  const meta = ["Wants MileClear on Android", args.driverType ? slackEscape(args.driverType) : null]
    .filter(Boolean)
    .join("  ·  ");
  return postToSlackFounder({
    text: `Android tester request: ${args.email}`,
    blocks: [
      section(`*Android tester request*\n${email}\n<${args.link}|Add to the Play tester list>`),
      context(meta),
    ],
  });
}

/**
 * "New subscriber" mirror. Only first subscriptions and resubscriptions
 * come through here; renewals stay in Discord.
 */
export async function slackNewSubscriber(args: {
  title: string;
  body?: string;
  userEmail?: string;
  userId?: string;
  platform?: string;
  plan?: "monthly" | "annual";
}): Promise<boolean> {
  const planLabel = args.plan === "annual" ? "Annual (£44.99/yr)" : args.plan === "monthly" ? "Monthly (£4.99/mo)" : null;
  const head = `*${slackEscape(args.title)}*` + (planLabel ? `  ·  ${planLabel}` : "") + (args.userEmail ? `\n${slackEscape(args.userEmail)}` : "");
  const meta = [args.platform, args.userId ? `ID ${args.userId}` : null].filter(Boolean).map((s) => slackEscape(String(s)));
  return postToSlackFounder({
    text: `${args.title}${planLabel ? " (" + planLabel + ")" : ""}${args.userEmail ? ": " + args.userEmail : ""}`,
    blocks: [
      section(head + (args.body ? `\n${slackEscape(args.body)}` : "")),
      ...(meta.length ? [context(meta.join("  ·  "))] : []),
    ],
  });
}

/**
 * Which billing alerts Slack should see. The celebrate tier also carries
 * renewals ("Pro subscription renewed"), which Anthony did not ask for.
 */
export function isNewSubscriberAlert(input: { tier: string; title: string }): boolean {
  if (input.tier !== "celebrate") return false;
  return !/renewed/i.test(input.title);
}
