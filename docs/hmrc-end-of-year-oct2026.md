# Tax return (end of year) for Making Tax Digital: research notes, 11 Oct 2026

Research done before building the end-of-year journey on branch `mtd-end-of-year`.
Everything below was read from HMRC's Developer Hub and GOV.UK on 11 Oct 2026.
The OpenAPI files were downloaded from the Developer Hub (`/api-documentation/docs/api/download/...`),
so paths and field names are copied from HMRC's own spec, not from memory.

Everything still runs against HMRC's sandbox until production credentials arrive.

## 1. API versions and endpoints

| API | Version used | Status on Developer Hub | Why this version |
|-----|-------------|-------------------------|------------------|
| Self Employment Business (MTD) | **5.0** | Beta, latest, Sandbox + Production | Same version the quarterly (cumulative) updates already use |
| Individual Calculations (MTD) | **8.0** | Beta, Sandbox + Production | Same version `calculations.ts` already uses. 9.0 exists but is marked "[test only]", Sandbox only, and its trigger, retrieve and final declaration specs are identical to 8.0 apart from the title |
| Obligations (MTD) | 3.0 | (already in use) | Quarterly obligations for the year check |

Links:
- Self Employment Business 5.0: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0
- Individual Calculations 8.0: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0
- Individual Calculations 9.0 (test only): https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/9.0
- End-to-end service guide, tax year end: https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/make-updates-at-tax-year-end.html
- Terminology style guide: https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/mtd-terminology.html

### (a) Self-employment annual submission (allowances and adjustments), SE Business API 5.0

```
PUT    /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}   create or amend (204, no body)
GET    /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}   retrieve (404 when nothing held)
DELETE /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}   delete
```

Accept header `application/vnd.hmrc.5.0+json`. Scopes: write for PUT/DELETE, read for GET.

Body (schema "def3" for 2025-26, "def4" for 2026-27 onwards) has three optional blocks:

- `adjustments`: includedNonTaxableProfits, basisAdjustment, overlapReliefUsed (2025-26 only, deprecated),
  accountingAdjustment, averagingAdjustment, outstandingBusinessIncome, balancingChargeBpra,
  balancingChargeOther, goodsAndServicesOwnUse, transitionProfitAmount,
  transitionProfitAccelerationAmount, and from 2026-27 `adjustmentToProfitsForClass4`.
- `allowances`: annualInvestmentAllowance, capitalAllowanceMainPool, capitalAllowanceSpecialRatePool,
  businessPremisesRenovationAllowance, enhancedCapitalAllowance, allowanceOnSales,
  capitalAllowanceSingleAssetPool, zeroEmissionsCarAllowance, tradingIncomeAllowance (0 to 1000,
  cannot be sent with any other allowance: `RULE_BOTH_ALLOWANCES_SUPPLIED`),
  structuredBuildingAllowance[], enhancedStructuredBuildingAllowance[], and from 2026-27
  `firstYearAllowanceOnPlantAndMachinery` (marked "[Test only]").
- `nonFinancials`: class4NicsExemptionReason.

An empty body is rejected (`RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED`). Amending replaces everything:
"it is necessary to provide all previously submitted figures again" (service guide, Amend allowance and adjustments).

The service guide says "**Some** customers must submit an annual summary update". It does not say every
customer must, so a driver with nothing to claim sends nothing. This is our reading; see open question 3.

### (b) Individual Calculations 8.0: trigger, retrieve, submit

```
POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/{calculationType}
     calculationType: in-year | intent-to-finalise | intent-to-amend (2025-26 onwards)
GET  /individuals/calculations/{nino}/self-assessment/{taxYear}                       list
GET  /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}       retrieve
POST /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}/{calculationType}
     calculationType: final-declaration | confirm-amendment (confirm-amendment from 2025-26)
     -> 204 No Content on success. No body. No reference number in the response.
```

This is the path that changed between versions: in 8.0 the final declaration is a POST to
`.../{taxYear}/{calculationId}/final-declaration`, with the tax year and the calculation type both in the path.

Retrieve notes:
- "if the calculation has been triggered recently and has not yet completed, this endpoint will return 404 Not Found",
  so 404 straight after a trigger means "still working", not "missing".
- `metadata.calculationType` can be in-year, intent-to-finalise, intent-to-amend, declare-finalisation, confirm-amendment.
- `messages.errors[]` / `warnings[]` / `info[]` each carry `{ id, text }`. When errors exist the calculation figures
  are not produced ("if there are errors, user will not be able to view calculation results").
- Headline figures for 2025-26: `calculation.taxCalculation.incomeTax.*`, `.nics.class2Nics.amount`,
  `.nics.class4Nics.totalAmount`, `.totalIncomeTaxAndNicsDue`, `.totalTaxDeducted`. Income sources in
  `calculation.businessProfitAndLoss[]` and `calculation.incomeSummaryTotals`. Personal allowance in
  `calculation.allowancesAndDeductions.personalAllowance`. Tax bands in
  `incomeTax.payPensionsProfit.taxBands[]` (and savingsAndGains / dividends).

Final declaration errors worth turning into plain English (from the 8.0 spec):
`RULE_FINAL_DECLARATION_TAX_YEAR` (tax year not over yet), `RULE_FINAL_DECLARATION_RECEIVED` (already sent),
`RULE_FINAL_DECLARATION_IN_PROGRESS`, `RULE_RECENT_SUBMISSIONS_EXIST` (data changed after the calculation),
`RULE_INCOME_SOURCES_CHANGED`, `RULE_RESIDENCY_CHANGED`, `RULE_NO_INCOME_SUBMISSIONS_EXIST`,
`RULE_INCOME_SOURCES_INVALID`, `RULE_SUBMISSION_FAILED`, `RULE_OUTSIDE_AMENDMENT_WINDOW`, `MATCHING_RESOURCE_NOT_FOUND`.

### (c) What HMRC requires software to do and show before the tax return is sent

From the end-to-end service guide, "Tax return" and "Agreeing to the declaration" sections:

1. Before starting, software must make sure the customer:
   - has sent quarterly update information for each business income source,
   - has already provided their entire income (for example interest, dividends, other SA schedules),
   - does not have any additional information to provide (for example how to treat a loss).
   "If your software will not allow customers to report their entire income and reliefs, customers should be
   informed to report them using HMRC online services." MileClear only sends self-employment income, so the
   app must ask about other income and send the driver elsewhere first.
2. Trigger a calculation with intent-to-finalise. This runs HMRC's business validation rules as errors, not warnings.
3. Retrieve the calculation and show it. "User views and confirms the tax calculation results
   (must be able to view equivalent of what is in the SA302 as minimum)."
4. Show the declaration. The customer agrees, then software calls Submit Final Declaration with the
   **same calculationId** the customer agreed to.
5. "Software displays the confirmation message to the user (HMRC does not do this)." It can take up to an hour
   for the obligation to show as fulfilled.

The declaration, verbatim from the service guide:

> "Before you can submit the information displayed here in response to your notice to file from HM Revenue & Customs, you must read and agree to the following statement by
>
> [Here the vendor can decide how to manage the actual declaration in the user interface, for example a tick box, confirm button or other method]
>
> I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information."

MileClear shows it as: the first sentence ending "...by ticking the box below.", then the statement word for word
next to a tick box. The agent version is not needed (MileClear has no agent journey).

Terminology guide (relevant to copy):
- "Do not use 'final declaration' in customer-facing products. Use **tax return**." So the app says
  "tax return" and the button is "Submit tax return", not "Send final declaration".
- Do not use "MTD" in user-facing content. Say "send" a quarterly update.
- "Refund", not "repayment".

## 2. End-of-year steps HMRC lists

### Built on branch `mtd-end-of-year-2` (11 Oct 2026)

Business Details API **2.0** (beta, Sandbox + Production, the version `businessDetails.ts` already uses).
Checked against HMRC's OpenAPI files on 11 Oct 2026:

```
GET /individuals/business/details/{nino}/{businessId}/{taxYear}/accounting-type     200 { "accountingType": "CASH" | "ACCRUAL" }
PUT /individuals/business/details/{nino}/{businessId}/{taxYear}/accounting-type     204, body { "accountingType": "CASH" | "ACCRUAL" }
GET /individuals/business/details/{nino}/{businessId}/{taxYear}/periods-of-account  200 { submittedOn, periodsOfAccount, periodsOfAccountDates? }
PUT /individuals/business/details/{nino}/{businessId}/{taxYear}/periods-of-account  204, body { periodsOfAccount, periodsOfAccountDates? }
```

- Minimum tax year 2025-26 (2024-25 in the sandbox). Both GETs 404 when HMRC holds nothing.
- The per-year accounting type says `ACCRUAL`; the older business record says `ACCRUALS`. MileClear treats both as
  traditional accounting.
- Periods of account: "This has to be submitted before final declaration." Dates must be sent when
  `periodsOfAccount` is true and left out when false (`RULE_PERIODS_OF_ACCOUNT`); end dates must fall inside the
  tax year (`RULE_END_DATE`); start dates inside or before it (`RULE_START_DATE`).

1. **Accounting method**: the app shows what HMRC holds and asks if it's right. Confirming sends nothing
   ("Software should first show the user what HMRC holds ... In the event the user needs to change the accounting
   method, software should then call the Update Accounting Type endpoint"). Changing it is an audited PUT
   (`accounting_type_update`). Choosing traditional accounting warns that MileClear works on cash basis.
2. **Accounting period**: the app asks whether a period ended in the tax year. Choices: the tax year (6 April to
   5 April), 1 April to 31 March, different dates, or none. The server builds HMRC's body from that answer and
   checks the dates first. Audited PUT (`periods_of_account_submit`). The submit route refuses to send the tax return
   while HMRC holds no periods of account.

### Still not built

3. **Late accounting date rule** election (only for accounting periods ending 31 March to 4 April).
4. **Losses** (Individual Losses API) and **BSAS accounting adjustments**: MileClear tells the driver to use
   other software or HMRC online services if they have a loss to claim.
5. **Other income** APIs (employment, savings, dividends, pensions, property): not built; the app sends the driver
   elsewhere, as the guide allows.
6. **Amending a tax return** (intent-to-amend + confirm-amendment): services can trigger intent-to-amend already,
   but there is no amendment journey.

## 3. Annual allowances and adjustments: what MileClear can justify sending

MileClear works out vehicle costs with the flat rate per mile (simplified expenses, AMAP rates). Rules, each with
its source. The code is `apps/api/src/services/hmrc/annualMapping.ts`.

| Field | MileClear sends | Why |
|-------|----------------|-----|
| Capital allowances on the vehicle (main pool, special rate pool, single asset pool, zero emissions car) | Nothing | The flat rate per mile is used "instead of the actual costs of buying and running your vehicle", and "You cannot claim simplified expenses for a vehicle you've already claimed capital allowances for" (GOV.UK, Simplified expenses: Vehicles). Claiming both would double count |
| Annual investment allowance and other capital allowances on equipment | Nothing | Under cash basis "you can only claim capital allowances on business cars" (GOV.UK, Claim capital allowances: What you can claim on), and equipment is already in the quarterly expenses. Under traditional accounting equipment may need capital allowances, which MileClear does not work out. The driver is told |
| Trading allowance | Nothing | "cannot deduct any other expenses or allowances if you claim the allowances" (GOV.UK, Tax-free allowances on property and trading income). MileClear's quarterly updates already claim expenses; HMRC says those must be removed by amending the final cumulative update first. When income is £1,000 or less the driver is told the allowance might suit them |
| Adjustments (basis, transition profit, balancing charges, goods for own use, accounting, averaging, Class 4) | Nothing | MileClear holds no data that would produce any of these. The driver is told to use other software or HMRC online services if one applies |
| Class 4 exemption reason | Nothing | Not held |

Result today: for every driver MileClear has nothing to send in the annual submission. The app says so plainly,
shows anything HMRC already holds for the year (sent by other software) without changing it, and moves on.
The service and route for create, amend, retrieve and delete exist so a future rule can send something.

## 4. Unknowns and where I am less sure

- **Annual submission optional when empty**: read from "Some customers must submit". The sandbox will tell us if
  intent-to-finalise rejects a year with no annual submission. Medium confidence.
- **The "reference" after submitting**: HMRC returns 204 with no body. The only identifiers are the calculationId
  the driver agreed to and the `X-CorrelationId` response header. The confirmation screen shows the calculation ID
  as the reference and keeps the correlation ID for support. High confidence on the API, but Anthony should decide
  whether that is enough for drivers.
- **SA302 equivalent**: the review screen shows income by source, personal allowance, taxable income, Income Tax
  by band, Class 2 and Class 4 National Insurance, tax already paid and the total due. That is close to an SA302
  but not a line-by-line copy. Medium confidence that it meets the "equivalent of the SA302 as minimum" bar.
- **9.0**: if HMRC moves production to 9.0 the paths look identical, so only the version constant changes.
