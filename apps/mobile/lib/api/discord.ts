// Discord OAuth link/unlink + status API client.
// Phase 1A of the Discord community roadmap (21 May 2026).

import { apiRequest } from "./index";

export interface DiscordLinkStatus {
  linked: boolean;
  discordUserId: string | null;
}

export interface DiscordStartResponse {
  url: string;
}

/**
 * Kick off the OAuth flow. Returns the Discord authorize URL the
 * mobile client should open in an in-app browser via
 * WebBrowser.openAuthSessionAsync.
 */
export function startDiscordLink() {
  return apiRequest<{ data: DiscordStartResponse }>("/auth/discord/start");
}

export function getDiscordStatus() {
  return apiRequest<{ data: DiscordLinkStatus }>("/auth/discord/status");
}

export function unlinkDiscord() {
  return apiRequest<{ data: { unlinked: boolean; already?: boolean } }>(
    "/auth/discord/unlink",
    { method: "POST" }
  );
}
