// TrueLayer Open Banking integration

export async function createTrueLayerAuthLink(
  _userId: string
): Promise<string> {
  // TODO: generate TrueLayer authorization URL
  throw new Error("Not implemented");
}

export async function fetchBankTransactions(
  _userId: string
): Promise<unknown[]> {
  // TODO: fetch transactions and filter for gig platform payments
  return [];
}
