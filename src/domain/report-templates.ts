/**
 * Built-in Markdown skeletons for a report's vulnerability information and impact, chosen by
 * weakness family.
 *
 * Responsibilities:
 * - Classify a program weakness into a family, by CWE id first and by name second.
 * - Provide a skeleton per family with visible `[Describe …]` prompts the hacker replaces.
 */

/** A group of related weaknesses that share a report skeleton. */
export type WeaknessFamily =
  | "xss"
  | "idor"
  | "ssrf"
  | "sqli"
  | "csrf"
  | "open-redirect"
  | "auth-bypass"
  | "information-disclosure"
  | "rce"
  | "business-logic"
  | "generic";

/** The template chosen for a weakness. */
export interface ReportTemplate {
  family: WeaknessFamily;
  /** Human-readable family name, e.g. "Cross-site scripting". */
  label: string;
  vulnerabilityInformation: string;
  impact: string;
}

/** The subset of a program weakness used for matching. */
export interface WeaknessLike {
  name: string;
  /** HackerOne's external id, such as `cwe-79`. */
  externalId: string | null;
}

interface FamilySpec {
  label: string;
  cwes: readonly number[];
  name: RegExp | null;
  summary: string;
  steps: readonly string[];
  poc: string;
  remediation: string;
  impact: string;
}

const FAMILIES: Readonly<Record<WeaknessFamily, FamilySpec>> = {
  ssrf: {
    label: "Server-side request forgery",
    cwes: [918],
    name: /server[\s-]*side request forgery|\bssrf\b/i,
    summary: "[Describe which parameter makes the server fetch a URL you control.]",
    steps: [
      "Send a request to the affected endpoint with the URL parameter set to a server you control.",
      "Observe the inbound request from the target's infrastructure.",
      "[Describe how you reached an internal host or metadata service, if you did.]",
    ],
    poc: "[Paste the request and the response or out-of-band interaction that proves the fetch.]",
    remediation:
      "Resolve and validate destinations against an allowlist, and block private, loopback and link-local ranges after DNS resolution.",
    impact:
      "[Explain which internal services or cloud metadata an attacker can reach through the server, and what data or credentials that exposes.]",
  },
  csrf: {
    label: "Cross-site request forgery",
    cwes: [352],
    name: /cross[\s-]*site request forgery|\bcsrf\b|\bxsrf\b/i,
    summary: "[Describe the state-changing action that accepts cross-origin requests.]",
    steps: [
      "Log in as the victim in one browser.",
      "Open the attacker page below in the same browser.",
      "Observe that the action was performed on the victim's account.",
    ],
    poc: "[Paste the auto-submitting HTML form or fetch call used as the attacker page.]",
    remediation:
      "Require an unpredictable per-session token on state-changing requests and set SameSite on session cookies.",
    impact:
      "[Explain what an attacker can make a logged-in victim do without consent, such as changing their email or making a purchase.]",
  },
  xss: {
    label: "Cross-site scripting",
    cwes: [79, 80, 83, 87],
    name: /cross[\s-]*site scripting|\bxss\b/i,
    summary:
      "[Describe where user input is rendered without encoding and whether it is stored or reflected.]",
    steps: [
      "Navigate to the affected page.",
      "Submit the payload below in the vulnerable field or parameter.",
      "[Describe where and when the payload executes, and for which users.]",
    ],
    poc: "[Paste the payload and the URL or request that delivers it.]",
    remediation:
      "Encode output for its context, avoid raw HTML sinks, and deploy a restrictive Content Security Policy.",
    impact:
      "[Explain what script running in a victim's session can do here, such as reading data, performing actions or taking over the account.]",
  },
  sqli: {
    label: "SQL injection",
    cwes: [89, 564],
    name: /sql[\s-]*injection|\bsqli\b/i,
    summary: "[Describe the parameter that is concatenated into a SQL query.]",
    steps: [
      "Send the baseline request to the affected endpoint.",
      "Send the same request with the payload below and compare the responses.",
      "[Describe the boolean, time-based or error-based difference you observed.]",
    ],
    poc: "[Paste the requests and the evidence, such as response timings or the database version string.]",
    remediation: "Use parameterised queries throughout and run the database account with least privilege.",
    impact:
      "[Explain which tables or records an attacker can read or modify, and whether this extends to authentication data.]",
  },
  "open-redirect": {
    label: "Open redirect",
    cwes: [601],
    name: /open[\s-]*redirect|url redirection/i,
    summary: "[Describe the parameter that controls the redirect destination.]",
    steps: [
      "Open the URL below in a browser.",
      "Observe the redirect to an external domain.",
      "[Describe any chain, such as leaking an OAuth code or token through the redirect.]",
    ],
    poc: "[Paste the crafted URL.]",
    remediation: "Only redirect to relative paths or to an allowlist of trusted destinations.",
    impact:
      "[Explain how the trusted domain lends credibility to phishing, or what tokens leak to the attacker's domain.]",
  },
  rce: {
    label: "Remote code execution",
    cwes: [77, 78, 94, 95, 96, 502, 917, 1336],
    name: /remote code|code execution|command injection|code injection|os command|deserializ|template injection|\brce\b/i,
    summary: "[Describe the input that reaches a command, interpreter, template engine or deserializer.]",
    steps: [
      "Send the request below to the affected endpoint.",
      "[Describe the harmless command you ran, such as `id` or a DNS lookup, and how you observed its output.]",
    ],
    poc: "[Paste the request and the command output or out-of-band interaction. Avoid destructive commands.]",
    remediation:
      "Never pass user input to shells or interpreters; use argument arrays, safe template sandboxes and typed deserialisation.",
    impact:
      "[Explain the level of access gained on the server and what it exposes, such as data, credentials or neighbouring systems.]",
  },
  "information-disclosure": {
    label: "Information disclosure",
    cwes: [200, 201, 209, 213, 215, 359, 497, 532, 538, 548],
    name: /information (disclosure|exposure)|sensitive (data|information)|\bleak/i,
    summary: "[Describe what sensitive information is exposed and to whom.]",
    steps: [
      "Send the request below to the affected endpoint.",
      "[Describe where the sensitive data appears in the response.]",
    ],
    poc: "[Paste a redacted excerpt of the exposed data.]",
    remediation: "Remove the data from the response, or restrict the endpoint to authorised users.",
    impact:
      "[Explain how the exposed data harms users or the organisation, or how it enables a further attack.]",
  },
  "auth-bypass": {
    label: "Authentication bypass",
    cwes: [287, 288, 290, 294, 302, 304, 306, 307, 384, 613, 620, 640],
    name: /authentication|account takeover|\bato\b|session fixation|password reset|\b2fa\b|\bmfa\b|brute force/i,
    summary: "[Describe the authentication control that can be bypassed.]",
    steps: [
      "Create or identify a victim account.",
      "[Describe the requests you modified to bypass the check.]",
      "Observe that you are signed in as the victim, or that the victim's credentials changed.",
    ],
    poc: "[Paste the key requests and responses, with tokens redacted.]",
    remediation:
      "Enforce the check server-side on every step of the flow and bind tokens to the account and session that requested them.",
    impact:
      "[Explain which accounts can be taken over, what interaction is needed from the victim, and what the attacker can then do.]",
  },
  idor: {
    label: "Insecure direct object reference",
    cwes: [284, 285, 639, 566, 862, 863, 269],
    name: /\bidor\b|insecure direct object|\bbola\b|broken object|access control|authori[sz]ation|privilege escalation/i,
    summary: "[Describe the object identifier that is not checked against the requesting user.]",
    steps: [
      "Create two accounts, A (attacker) and B (victim).",
      "As B, create the object and note its identifier.",
      "As A, send the request below with B's identifier.",
      "Observe that A can read or modify B's object.",
    ],
    poc: "[Paste the request sent as account A and the response containing account B's data.]",
    remediation:
      "Authorise every object access against the requesting user, not just the session's validity.",
    impact:
      "[Explain whose data is exposed or modifiable, how identifiers can be enumerated, and how many users are affected.]",
  },
  "business-logic": {
    label: "Business logic",
    cwes: [362, 367, 840, 841, 770, 799, 837],
    name: /business logic|logic (error|flaw)|race condition|payment|workflow/i,
    summary: "[Describe the intended workflow and the rule your steps violate.]",
    steps: [
      "[Describe the first step of the flow.]",
      "[Describe the request you altered, replayed or sent concurrently.]",
      "Observe the unintended outcome.",
    ],
    poc: "[Paste the requests, or the script used for concurrent requests.]",
    remediation: "Enforce the business rule server-side and make the affected operation atomic.",
    impact:
      "[Explain the concrete consequence, such as financial loss, bypassed limits or unfair advantage, and its scale.]",
  },
  generic: {
    label: "General",
    cwes: [],
    name: null,
    summary: "[Describe the vulnerability in one or two sentences.]",
    steps: ["[Describe the first step.]", "[Describe the next step.]", "Observe the result described above."],
    poc: "[Paste the request, payload or script that demonstrates the issue.]",
    remediation: "[Describe how the issue could be fixed.]",
    impact:
      "[Explain what an attacker gains, which users are affected, and what it costs them or the organisation.]",
  },
};

// Order matters for name matching: SSRF must be tried before CSRF ("request forgery"), and the
// specific families before the broader authentication, access-control and logic patterns.
const MATCH_ORDER: readonly Exclude<WeaknessFamily, "generic">[] = [
  "ssrf",
  "csrf",
  "xss",
  "sqli",
  "open-redirect",
  "rce",
  "information-disclosure",
  "auth-bypass",
  "idor",
  "business-logic",
];

function cweNumber(externalId: string | null): number | null {
  const match = /^cwe-(\d+)$/i.exec(externalId?.trim() ?? "");
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Classifies a weakness into a template family. A CWE id wins over the name, since program
 * weakness names vary ("Cross-site Scripting (XSS) - Stored", "XSS - DOM", …).
 *
 * @example
 * weaknessFamily({ name: "Anything", externalId: "cwe-918" }); // "ssrf"
 */
export function weaknessFamily(weakness: WeaknessLike | null): WeaknessFamily {
  if (!weakness) return "generic";
  const cwe = cweNumber(weakness.externalId);
  if (cwe !== null) {
    const byCwe = MATCH_ORDER.find((family) => FAMILIES[family].cwes.includes(cwe));
    if (byCwe) return byCwe;
  }
  return MATCH_ORDER.find((family) => FAMILIES[family].name?.test(weakness.name)) ?? "generic";
}

function render(spec: FamilySpec): Omit<ReportTemplate, "family"> {
  const steps = spec.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const vulnerabilityInformation = [
    "## Summary",
    "",
    spec.summary,
    "",
    "## Affected endpoint",
    "",
    "[Describe the affected URL, HTTP method and parameter.]",
    "",
    "## Steps to reproduce",
    "",
    steps,
    "",
    "## Proof of concept",
    "",
    spec.poc,
    "",
    "## Remediation suggestion",
    "",
    spec.remediation,
    "",
  ].join("\n");
  return { label: spec.label, vulnerabilityInformation, impact: `${spec.impact}\n` };
}

/**
 * Returns the built-in report skeleton for a weakness. Unknown or missing weaknesses get the
 * generic skeleton.
 *
 * @param weakness - The selected program weakness, or `null` when none is chosen.
 * @example
 * templateForWeakness({ name: "Cross-site Scripting (XSS) - Stored", externalId: "cwe-79" }).family; // "xss"
 */
export function templateForWeakness(weakness: WeaknessLike | null): ReportTemplate {
  const family = weaknessFamily(weakness);
  return { family, ...render(FAMILIES[family]) };
}
