const ORIGIN = "https://hackerone.com";

const segment = (value: string) => encodeURIComponent(value.trim());

/**
 * Pages the Hacker API has no endpoint for. Paths were checked against docs.hackerone.com;
 * see docs/api-coverage.md for the source of each one.
 */
export const hackerOne = {
  apiToken: `${ORIGIN}/settings/api_token/edit`,
  accountSettings: `${ORIGIN}/settings/account`,
  twoFactor: `${ORIGIN}/settings/authentication/edit`,
  paymentSetup: `${ORIGIN}/settings/rewards_and_payments/payment_setup`,
  hacktivity: `${ORIGIN}/hacktivity`,
  profile: (username: string) => `${ORIGIN}/${segment(username)}`,
  report: (id: string) => `${ORIGIN}/reports/${segment(id)}`,
  program: (handle: string) => `${ORIGIN}/${segment(handle)}`,
  programScope: (handle: string) => `${ORIGIN}/${segment(handle)}/policy_scopes`,
};
