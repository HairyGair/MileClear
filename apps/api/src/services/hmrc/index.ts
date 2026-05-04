// HMRC MTD ITSA service — public exports.

export {
  getHmrcConfig,
  resetHmrcConfig,
  HMRC_SCOPES,
  type HmrcConfig,
  type HmrcEnvironment,
} from "./config.js";

export {
  generateStateToken,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  expiryFromExpiresIn,
  isTokenExpiringSoon,
  type OAuthTokenResponse,
} from "./oauth.js";

export {
  buildFraudPreventionHeaders,
  type ClientContext,
  type MobileClientContext,
  type WebClientContext,
  type ServerContext,
  type ConnectionMethod,
} from "./fraudPreventionHeaders.js";
