// Bot-side Discord actions — anything that needs the bot token rather
// than a channel webhook. Specifically: assigning + revoking server
// roles, looking up a member's current roles.
//
// Distinct from services/discord.ts which is purely outbound webhooks
// (no auth needed, channel-scoped). This file uses the bot token,
// which can act as the bot user across the whole server.
//
// Defensive: every helper is a silent no-op when the relevant env vars
// aren't set (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_PRO_ROLE_ID).
// API endpoints stay green even if Discord is misconfigured.

const API = "https://discord.com/api/v10";

function botCreds(): { token: string; guildId: string } | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;
  return { token, guildId };
}

function proRoleId(): string | null {
  return process.env.DISCORD_PRO_ROLE_ID || null;
}

async function api<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const retryMs = Math.max(((body as any).retry_after ?? 1) * 1000, 500);
    await new Promise((r) => setTimeout(r, retryMs));
    return api<T>(token, path, init);
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Discord bot ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`
    );
  }
  return (await res.json()) as T;
}

interface GuildMember {
  user?: { id: string; username?: string };
  roles: string[];
  nick?: string | null;
}

/**
 * Look up a member in the MileClear server. Returns `null` if the user
 * isn't in the server (or we can't reach Discord) — never throws.
 */
export async function fetchGuildMember(
  discordUserId: string
): Promise<GuildMember | null> {
  const creds = botCreds();
  if (!creds) return null;
  try {
    return await api<GuildMember>(
      creds.token,
      `/guilds/${creds.guildId}/members/${discordUserId}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) return null; // not in server
    console.warn(`[discordBot] fetchGuildMember failed:`, msg);
    return null;
  }
}

/**
 * Assign the Pro Member role to a Discord user. Returns `true` on
 * success, `false` on any failure (missing config, user not in server,
 * bot's role too low in the hierarchy, etc.) Never throws.
 *
 * Idempotent — Discord's PUT role endpoint is fine to call when the
 * role's already assigned.
 */
export async function grantProMemberRole(discordUserId: string): Promise<boolean> {
  const creds = botCreds();
  const roleId = proRoleId();
  if (!creds || !roleId) return false;
  try {
    await api<null>(
      creds.token,
      `/guilds/${creds.guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: "PUT" }
    );
    return true;
  } catch (err) {
    console.warn(
      `[discordBot] grantProMemberRole(${discordUserId}) failed:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Revoke the Pro Member role. Counterpart to grantProMemberRole.
 * Returns `true` on success.
 */
export async function revokeProMemberRole(discordUserId: string): Promise<boolean> {
  const creds = botCreds();
  const roleId = proRoleId();
  if (!creds || !roleId) return false;
  try {
    await api<null>(
      creds.token,
      `/guilds/${creds.guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: "DELETE" }
    );
    return true;
  } catch (err) {
    console.warn(
      `[discordBot] revokeProMemberRole(${discordUserId}) failed:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Decide whether the user currently deserves the Pro role and sync it.
 * `isPremium` is the source of truth from the MileClear DB. Returns
 * an outcome string for logging.
 */
export async function syncProMemberRole(args: {
  discordUserId: string;
  isPremiumActive: boolean;
}): Promise<"granted" | "revoked" | "noop_not_in_server" | "noop_not_configured"> {
  const creds = botCreds();
  const roleId = proRoleId();
  if (!creds || !roleId) return "noop_not_configured";

  const member = await fetchGuildMember(args.discordUserId);
  if (!member) return "noop_not_in_server";

  const hasRole = member.roles.includes(roleId);
  if (args.isPremiumActive && !hasRole) {
    const ok = await grantProMemberRole(args.discordUserId);
    return ok ? "granted" : "noop_not_configured";
  }
  if (!args.isPremiumActive && hasRole) {
    const ok = await revokeProMemberRole(args.discordUserId);
    return ok ? "revoked" : "noop_not_configured";
  }
  return hasRole ? "granted" : "revoked"; // already in correct state
}
