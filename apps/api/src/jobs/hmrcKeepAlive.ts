// HMRC Developer Hub keep-alive ping.
//
// Calls GET /hello/application against the HMRC sandbox once a week. The
// only purpose is to update the "Last API call" timestamp visible on the
// developer hub against our MileClear application — HMRC's reviewers
// sometimes use that timestamp as a signal that an app under production-
// credentials review is still actively being developed.
//
// Without this job, the sandbox app would go silent for weeks between
// release cycles (the user-facing /hmrc/* routes only fire when a real
// user does an MTD action, which is rare during the accreditation
// window). A silent app risks being deprioritised in the review queue.
//
// Mechanics:
//   1. Get an application-restricted access token via client_credentials
//      grant. Short-lived (~4h), no refresh needed — we throw it away
//      after the call.
//   2. GET /hello/application with the token + standard Accept header.
//   3. Log success/failure. Failure is non-fatal — the next weekly tick
//      will retry.
//
// Prerequisite: the "Hello World" API must be subscribed to on the dev
// hub (free, no review). Without it this returns 403 NOT_SUBSCRIBED and
// the log line makes the fix obvious.
//
// Disabled automatically when HMRC creds aren't configured (local dev).
// Anthony 20 May 2026.

import { getHmrcConfig } from "../services/hmrc/config.js";
import { getApplicationAccessToken } from "../services/hmrc/oauth.js";

export async function runHmrcKeepAliveJob(): Promise<void> {
  const config = getHmrcConfig();
  if (!config) {
    // No HMRC creds configured (typical local dev). Silently skip.
    return;
  }

  let token: string;
  try {
    const res = await getApplicationAccessToken({ config });
    token = res.access_token;
  } catch (err) {
    console.warn(
      "[hmrcKeepAlive] token request failed (env=" + config.environment + "):",
      err instanceof Error ? err.message : err
    );
    return;
  }

  try {
    const url = `${config.apiBaseUrl}/hello/application`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.hmrc.1.0+json",
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(
        `[hmrcKeepAlive] /hello/application returned HTTP ${res.status} (env=${config.environment}). ` +
          `Body: ${detail.slice(0, 200)}`
      );
      return;
    }
    console.log(
      `[hmrcKeepAlive] OK — Last API call refreshed on dev hub (env=${config.environment})`
    );
  } catch (err) {
    console.warn(
      "[hmrcKeepAlive] /hello/application call failed:",
      err instanceof Error ? err.message : err
    );
  }
}
