import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let plaidClient: PlaidApi | null = null;

if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
  const env = process.env.PLAID_ENV || "sandbox";
  const basePath =
    env === "production"
      ? PlaidEnvironments.production
      : env === "development"
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
} else {
  console.warn("PLAID_CLIENT_ID / PLAID_SECRET not set — Open Banking features disabled");
}

export { plaidClient };
