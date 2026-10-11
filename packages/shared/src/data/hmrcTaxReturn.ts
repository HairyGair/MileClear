// HMRC's tax return declaration, shared by the app (which shows it) and the
// API (which records which wording the driver agreed to).
//
// Source: HMRC Developer Hub, Income Tax end-to-end service guide, "Agreeing
// to the declaration":
// https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/make-updates-at-tax-year-end.html#agreeing-to-the-declaration
//
// HMRC's text runs: "Before you can submit the information displayed here in
// response to your notice to file from HM Revenue & Customs, you must read and
// agree to the following statement by [vendor decides: tick box, confirm
// button or other method]". MileClear uses a tick box, so the bracket becomes
// "ticking the box below." The statement itself is word for word.
//
// Do not reword TAX_RETURN_DECLARATION_STATEMENT. If HMRC changes it, change
// it here and bump TAX_RETURN_DECLARATION_VERSION so the audit log shows
// which wording each driver agreed to.

export const TAX_RETURN_DECLARATION_VERSION = "hmrc-e2e-guide-2026-10";

export const TAX_RETURN_DECLARATION_INTRO =
  "Before you can submit the information displayed here in response to your notice to file from HM Revenue & Customs, you must read and agree to the following statement by ticking the box below.";

export const TAX_RETURN_DECLARATION_STATEMENT =
  "I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.";
