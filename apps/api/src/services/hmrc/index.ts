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

export {
  listBusinesses,
  retrieveBusiness,
  pickPrimarySelfEmployment,
  type HmrcBusinessType,
  type HmrcBusinessSummary,
  type HmrcBusinessListResponse,
  type HmrcBusinessAddress,
  type HmrcBusinessDetails,
  type HmrcBusinessDetailsResponse,
} from "./businessDetails.js";

export {
  listPeriodSummaries,
  retrievePeriodSummary,
  submitPeriodSummary,
  amendPeriodSummary,
  submitCumulativePeriodSummary,
  retrieveCumulativePeriodSummary,
  isValidHmrcTaxYear,
  type HmrcPeriodSummaryListItem,
  type HmrcPeriodSummaryListResponse,
  type HmrcPeriodIncome,
  type HmrcPeriodExpenses,
  type HmrcPeriodDisallowableExpenses,
  type HmrcPeriodSummaryDetail,
  type HmrcPeriodSummarySubmitBody,
  type HmrcSubmitPeriodResponse,
  type HmrcCumulativeSubmitBody,
} from "./selfEmployment.js";

export {
  buildPeriodSubmission,
  getQuartersForTaxYear,
  penceToPounds,
  poundsToPence,
  type QuarterBoundary,
  type PeriodSubmissionPayload,
  type PeriodSubmissionBreakdown,
} from "./periodMapping.js";

export {
  triggerCalculation,
  listCalculations,
  retrieveCalculation,
  summariseCalculation,
  isValidCalculationType,
  type CalculationType,
  type HmrcTriggerCalculationResponse,
  type HmrcCalculationListItem,
  type HmrcCalculationListResponse,
  type HmrcCalculationSummary,
} from "./calculations.js";

export {
  triggerBsas,
  listBsas,
  retrieveSelfEmploymentBsas,
  summariseBsas,
  isValidBsasBusinessType,
  type BsasBusinessType,
  type HmrcTriggerBsasResponse,
  type HmrcBsasListItem,
  type HmrcBsasListResponse,
  type HmrcBsasSummary,
} from "./bsas.js";
