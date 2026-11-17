interface Window {
  __mockBackend?: {
    submitted: unknown[];
    hacktivityQueries: string[];
    programs: Record<string, unknown>[];
    reports: Record<string, unknown>[];
    hacktivity: Record<string, unknown>[];
    earnings: Record<string, unknown>[];
    payouts: Record<string, unknown>[];
    intents: Record<string, unknown>[];
    balance: number;
  };
}
