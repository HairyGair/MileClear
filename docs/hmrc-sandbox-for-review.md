# HMRC test service for App Review

Apple's reviewer signs in as `demo@mileclear.com` and has to go through the whole quarterly update journey. That must run against HMRC's test service, never real HMRC. Everyone else stays on the live service.

## How it works

Accounts listed in `HMRC_SANDBOX_USER_IDS` use HMRC's test service (`test-api.service.hmrc.gov.uk`) and their own HMRC app credentials. For those accounts only:

- Connect, token refresh, every API call and the fraud-prevention headers use the test service and the test client.
- `/hmrc/status` reports `environment: "sandbox"`, so the app words its screens as the test version.
- A connection made on the other service counts as not connected.
- The end-of-year flow is open (the `YEAR_END_NOT_LIVE` refusal does not apply).
- "What you owe HMRC" works even while `HMRC_BALANCE` is off.
- No deadline reminders are sent and no Discord error alerts fire for them.

If the sandbox client id or secret is missing, listed accounts get no HMRC access at all (the screens answer not available) and the server logs one warning. They are never sent to the live service.

## Env vars to add on prod

```
HMRC_SANDBOX_USER_IDS=a36cf460-6270-4dd9-81e9-5f6cfb6145e4
HMRC_SANDBOX_CLIENT_ID=<client id of the HMRC test-service app>
HMRC_SANDBOX_CLIENT_SECRET=<client secret of the HMRC test-service app>
```

Existing `HMRC_ENVIRONMENT=production`, `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET` stay as they are. Restart the API after adding them (any pm2 restart costs the usual ~49 s of 401s). No database migration is needed.

## HMRC developer hub checks (sandbox application)

- The redirect URI `https://api.mileclear.com/hmrc/callback` must be registered on the sandbox application. It is a separate application from the production one, so check it even though the address is the same.
- The sandbox application must be subscribed to the same APIs the app uses, including Self Assessment Accounts and the year-end APIs, and the scopes in `HMRC_SCOPES` must be allowed.
- The keep-alive job calls `/hello/application` for the sandbox application too, so subscribe it to Hello World.

## How the reviewer connects

The codebase does not create HMRC test users; they come from HMRC's Create Test User page on the developer hub (https://developer.service.hmrc.gov.uk/api-test-user). Create an Individual test user with the Self Assessment service enabled, and keep its user ID, password, NINO and MTD Income Tax ID out of this repo (it is public). Put them in the App Review notes only.

In the app: Tax tab, Your tax details, If you work for yourself, Quarterly updates. The screen reads as a test version. Tap Continue, sign in on HMRC's page with the test user ID and password, enter the test user's NINO, then send a quarterly update. The year-end flow is available from the same screen.

## App Review note wording

> The quarterly updates feature connects to HMRC's test service for this demo account, so no real tax records are involved. To try it: open Tax, then Your tax details, then Quarterly updates, and tap Continue. Sign in on HMRC's page with this test user: User ID [ID], Password [password]. When asked for a National Insurance number, enter [NINO]. You can then review and send a quarterly update and open the end-of-year steps. Other MileClear accounts connect to the live HMRC service.

Wording rules: no adjective about MileClear next to HMRC, and do not say "approved" or "recognised".
