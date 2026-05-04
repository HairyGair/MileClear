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

export {
  hmrcCall,
  HmrcError,
  HmrcNotConnectedError,
  HmrcReauthRequiredError,
  type HmrcCallOptions,
} from "./client.js";

export {
  buildClientContext,
  buildServerContext,
} from "./requestContext.js";

export {
  fetchObligations,
  normaliseObligation,
  type HmrcObligation,
  type NormalisedObligation,
  type HmrcObligationsResponse,
} from "./obligations.js";
