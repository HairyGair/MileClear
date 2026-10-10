import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Business Profile became Invoice details on the Invoices screen.
 */
export default function Legacy_business() {
  return <Redirect href="/invoice-details" />;
}
