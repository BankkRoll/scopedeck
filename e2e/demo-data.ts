/**
 * Fictional data for README screenshots. Every program, report, payout and person here is made
 * up, so screenshots never show a real account's activity.
 */

type Json = Record<string, unknown>;

const PROGRAMS: [handle: string, name: string, bounty: boolean][] = [
  ["initech", "Initech", true],
  ["northwind", "Northwind Traders", true],
  ["contoso", "Contoso", false],
  ["fabrikam", "Fabrikam", true],
];

function severity(rating: string | null): Json | null {
  if (!rating) return null;
  return {
    id: `sev-${rating}`,
    rating,
    authorType: "User",
    score: null,
    attackVector: null,
    attackComplexity: null,
    privilegesRequired: null,
    userInteraction: null,
    scope: null,
    confidentiality: null,
    integrity: null,
    availability: null,
    createdAt: null,
  };
}

function bounty(amount: number): Json[] {
  if (!amount) return [];
  return [
    {
      id: `b-${String(amount)}`,
      amount: amount.toFixed(2),
      bonusAmount: null,
      awardedAmount: amount.toFixed(2),
      awardedBonusAmount: null,
      awardedCurrency: "USD",
      createdAt: "2026-10-20T00:00:00Z",
    },
  ];
}

/** Extra fictional programs, cloned from the mock backend's first program. */
export function demoPrograms(base: Json): Json[] {
  return PROGRAMS.map(([handle, name, bounty], index) => ({
    ...base,
    id: String(900 + index),
    handle,
    name,
    offersBounties: bounty,
    profilePicture: null,
    numberOfReportsForUser: index + 1,
    bountyEarnedForUser: bounty ? (index + 1) * 750 : 0,
  }));
}

const REPORTS: [
  title: string,
  state: string,
  rating: string | null,
  amount: number,
  program: string,
  daysAgo: number,
][] = [
  ["Stored XSS in invoice notes renders for admins", "triaged", "high", 0, "initech", 1],
  ["Account takeover through password reset token reuse", "resolved", "critical", 5000, "northwind", 3],
  ["GraphQL introspection leaks internal mutations", "needs-more-info", "medium", 0, "fabrikam", 2],
  ["Race condition lets coupons apply twice", "resolved", "medium", 750, "initech", 12],
  ["SSRF through webhook preview fetches metadata", "new", "high", 0, "northwind", 0],
  ["Missing rate limit on OTP verification", "duplicate", "low", 0, "contoso", 20],
  ["Clickjacking on settings page", "informative", "none", 0, "contoso", 30],
  ["Path traversal in export download", "retesting", "high", 1500, "fabrikam", 4],
];

function daysAgo(days: number): string {
  return new Date(Date.UTC(2026, 10, 17 - days, 10)).toISOString();
}

/** Extra fictional reports, cloned from the mock backend's first report. */
export function demoReports(base: Json): Json[] {
  return REPORTS.map(([title, state, rating, amount, program, days], index) => ({
    ...base,
    id: String(2001 + index),
    title,
    state,
    severity: severity(rating),
    bounties: bounty(amount),
    program: { id: program, handle: program },
    createdAt: daysAgo(days + 6),
    submittedAt: daysAgo(days + 6),
    lastActivityAt: daysAgo(days),
  }));
}

const HACKTIVITY: [
  title: string,
  rating: string,
  amount: number,
  program: string,
  cwe: string,
  votes: number,
][] = [
  [
    "Full read SSRF via PDF generator",
    "critical",
    12500,
    "northwind",
    "Server-Side Request Forgery (SSRF)",
    311,
  ],
  [
    "OAuth state fixation leads to account linking",
    "high",
    4000,
    "initech",
    "Cross-Site Request Forgery (CSRF)",
    128,
  ],
  ["Blind SQL injection in legacy search", "critical", 8000, "fabrikam", "SQL Injection", 204],
  [
    "IDOR on shipment tracking API",
    "medium",
    1000,
    "northwind",
    "Insecure Direct Object Reference (IDOR)",
    57,
  ],
  ["Subdomain takeover on marketing site", "medium", 500, "contoso", "Improper Access Control - Generic", 44],
  ["Prototype pollution in config loader", "high", 2500, "initech", "Prototype Pollution", 89],
  ["Open redirect in login flow", "low", 150, "fabrikam", "Open Redirect", 12],
  ["Exposed debug endpoint reveals environment", "high", 3000, "contoso", "Information Disclosure", 73],
];

/** Fictional disclosed reports for the Hacktivity page. */
export function demoHacktivity(base: Json): Json[] {
  return HACKTIVITY.map(([title, rating, amount, program, cwe, votes], index) => ({
    ...base,
    id: String(700100 + index),
    title,
    severityRating: rating,
    totalAwardedAmount: amount,
    cwe,
    votes,
    programHandle: program,
    programName: PROGRAMS.find(([handle]) => handle === program)?.[1] ?? program,
    reporterUsername: ["nullbyte", "kestrel", "mira", "oxide"][index % 4],
    disclosedAt: daysAgo(index * 9 + 2),
    latestDisclosableActivityAt: daysAgo(index * 9 + 2),
    url: null,
  }));
}

/** Twelve months of fictional earnings with a few payouts. */
export function demoEarnings(): { earnings: Json[]; payouts: Json[]; balance: number } {
  const amounts = [500, 1500, 750, 2500, 300, 4000, 1000, 250, 3200, 900, 1800, 5000, 600, 1250];
  const earnings = amounts.map((amount, index) => {
    const [handle, name] = PROGRAMS[index % PROGRAMS.length] ?? ["initech", "Initech"];
    return {
      id: `demo-${String(index)}`,
      kind: index % 5 === 4 ? "retest" : "bounty",
      amount,
      createdAt: new Date(Date.UTC(2026, 10 - Math.floor(index * 0.85), 3 + index)).toISOString(),
      programHandle: handle,
      programName: name,
      reportId: String(3000 + index),
    };
  });
  const payouts = [6200, 9800, 4100].map((amount, index) => ({
    amount,
    paidOutAt: new Date(Date.UTC(2026, 9 - index * 3, 1)).toISOString(),
    reference: `PO-${String(4410 + index)}`,
    payoutProvider: index === 1 ? "Bank transfer" : "PayPal",
    status: "sent",
  }));
  return { earnings, payouts, balance: 1850 };
}

/** Fictional report intents in each phase. */
export function demoIntents(): Json[] {
  const phases: [title: string, state: string, phase: string, bugClass: string | null, url: string | null][] =
    [
      [
        "Stored XSS in comment preview",
        "ready_to_submit",
        "ready",
        "Cross-site Scripting (XSS) - Stored",
        "https://app.initech.example/comments",
      ],
      ["Auth bypass on internal admin route", "pending", "analyzing", null, null],
      [
        "Weak JWT signature validation",
        "draft",
        "needsInput",
        "Improper Authentication",
        "https://api.northwind.example/v2/session",
      ],
      [
        "CSV injection in export",
        "submitted",
        "submitted",
        "CSV Injection",
        "https://fabrikam.example/export",
      ],
    ];
  return phases.map(([title, state, phase, bugClass, url], index) => ({
    id: String(5100 + index),
    title,
    description: `${title}\n\nSteps to reproduce and impact.`,
    state,
    phase,
    hasFailingJobs: false,
    hasCanceledJobs: false,
    jobStatusByType: {},
    metadata: { bugClass, httpMethod: url ? "POST" : null, vulnerableUrl: url, vulnerableParameter: null },
    programId: null,
    reportId: phase === "submitted" ? "2004" : null,
    attachments: [],
    createdAt: daysAgo(index * 3 + 1),
    updatedAt: daysAgo(index * 2),
  }));
}
