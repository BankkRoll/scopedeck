import { mockIPC } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

type Json = Record<string, unknown>;

const NOW = new Date().toISOString();

function program(handle: string, name: string, extra: Json = {}): Json {
  return {
    id: String(handle.length * 7),
    handle,
    name,
    currency: "usd",
    policy: `# ${name} policy\n\nTest only the assets listed in scope. **No denial of service.**\n\n<script>alert(1)</script>`,
    profilePicture: null,
    submissionState: "open",
    state: "public_mode",
    triageActive: true,
    startedAcceptingAt: "2024-01-01T00:00:00Z",
    numberOfReportsForUser: 2,
    numberOfValidReportsForUser: 1,
    bountyEarnedForUser: 1500,
    lastInvitationAcceptedAtForUser: null,
    bookmarked: false,
    allowsBountySplitting: true,
    offersBounties: true,
    openScope: false,
    fastPayments: true,
    goldStandardSafeHarbor: true,
    pinned: false,
    ...extra,
  };
}

function scope(id: string, assetIdentifier: string, extra: Json = {}): Json {
  return {
    id,
    assetIdentifier,
    assetType: "URL",
    eligibleForBounty: true,
    eligibleForSubmission: true,
    instruction: null,
    maxSeverity: "critical",
    confidentialityRequirement: "high",
    integrityRequirement: "high",
    availabilityRequirement: "low",
    reference: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    changedSinceLastSync: false,
    ...extra,
  };
}

function report(id: string, title: string, state: string, extra: Json = {}): Json {
  return {
    id,
    title,
    vulnerabilityInformation: "## Steps\n\n1. Open the invoice endpoint\n2. Change the id",
    state,
    createdAt: "2026-10-01T10:00:00Z",
    submittedAt: "2026-10-01T10:00:00Z",
    triagedAt: null,
    closedAt: null,
    lastActivityAt: "2026-11-10T10:00:00Z",
    lastReporterActivityAt: null,
    firstProgramActivityAt: null,
    lastProgramActivityAt: null,
    bountyAwardedAt: null,
    disclosedAt: null,
    cveIds: [],
    program: { id: "28", handle: "acme" },
    weakness: {
      id: "60",
      name: "Insecure Direct Object Reference (IDOR)",
      description: null,
      externalId: "cwe-639",
      createdAt: null,
    },
    severity: null,
    structuredScope: null,
    activities: [
      {
        id: `${id}-a1`,
        kind: "activity-comment",
        message: "Thanks, we are looking into this.",
        internal: false,
        createdAt: "2026-11-10T10:00:00Z",
        actor: { kind: "user", username: "acme_triage", name: "Triage", handle: null },
        attachments: [],
      },
    ],
    attachments: [],
    bounties: [],
    summaries: [],
    ...extra,
  };
}

const EARNINGS: Json[] = [
  {
    id: "1",
    kind: "bounty",
    amount: 1500,
    createdAt: "2026-09-01T00:00:00Z",
    programHandle: "acme",
    programName: "Acme Corp",
    reportId: "1002",
  },
];

const PAYOUTS: Json[] = [
  {
    amount: 750,
    paidOutAt: "2026-10-01T00:00:00Z",
    reference: "PO-1",
    payoutProvider: "PayPal",
    status: "sent",
  },
];

interface MockState {
  username: string | null;
  programs: Json[];
  reports: Json[];
  drafts: Map<string, Json>;
  templates: Json[];
  searches: Json[];
  settings: Json;
  submitted: Json[];
  hacktivityQueries: string[];
  hacktivity: Json[];
  balance: number;
  earnings: Json[];
  payouts: Json[];
  intents: Json[];
  ai: Json;
  notes: Map<string, Json>;
}

function initialState(): MockState {
  return {
    username: null,
    programs: [program("acme", "Acme Corp"), program("globex", "Globex", { offersBounties: false })],
    reports: [
      report("1001", "IDOR exposes other tenants' invoices", "triaged"),
      report("1002", "Open redirect on login", "resolved"),
    ],
    drafts: new Map(),
    templates: [],
    searches: [],
    settings: { theme: "dark", syncIntervalMinutes: 15, notifications: false },
    submitted: [],
    hacktivityQueries: [],
    hacktivity: [
      {
        id: "689314",
        title: "SSRF in PDF renderer",
        substate: "Resolved",
        url: "https://hackerone.com/reports/689314",
        disclosed: true,
        disclosedAt: "2026-06-01T00:00:00Z",
        submittedAt: null,
        cveIds: [],
        cwe: "Server-Side Request Forgery (SSRF)",
        severityRating: "critical",
        votes: 42,
        totalAwardedAmount: 10000,
        latestDisclosableAction: "Activities::ReportBecamePublic",
        latestDisclosableActivityAt: "2026-06-01T00:00:00Z",
        summary: null,
        reporterUsername: "finder",
        programHandle: "acme",
        programName: "Acme Corp",
        programUrl: null,
      },
    ],
    balance: 750,
    earnings: EARNINGS,
    payouts: PAYOUTS,
    intents: [],
    ai: { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: null, enabled: false, hasKey: false },
    notes: new Map(),
  };
}

const unauthorized = { kind: "api", error: { kind: "unauthorized", detail: null } };

function cached<T>(data: T) {
  return { data, syncedAt: NOW };
}

function field(payload: InvokeArgs | undefined, key: string): unknown {
  return (payload as Record<string, unknown> | undefined)?.[key];
}

const text = (payload: InvokeArgs | undefined, key: string) => {
  const value = field(payload, key);
  return typeof value === "string" ? value : "";
};
const object = (payload: InvokeArgs | undefined, key: string) => (field(payload, key) ?? {}) as Json;

/** Canned, deterministic assistant replies keyed off the prompt format the app sends. */
function mockCompletion(system: string, prompt: string): string {
  if (system.includes('"findings"')) {
    return JSON.stringify({
      findings: [
        {
          level: "warning",
          message:
            "The policy asks for IDOR reports to use two accounts you own. Say in the steps that both tenants are test accounts you created.",
        },
        {
          level: "note",
          message:
            "Clickjacking is excluded, but this report is an access control issue, so the exclusion does not apply.",
        },
      ],
    });
  }
  if (system.includes('"titles"')) {
    return JSON.stringify({
      titles: [
        "Stored XSS in profile bio runs script in admin user list",
        "Unescaped profile bio allows account takeover of administrators",
        "HTML injection in bio field executes JavaScript for staff viewers",
      ],
    });
  }
  if (system.includes('"vulnerabilityInformation"')) {
    return JSON.stringify({
      title: "Stored XSS in profile bio runs script in the admin user list",
      severity: "high",
      vulnerabilityInformation:
        "## Summary\n\nThe bio field on /settings/profile is rendered without escaping in the admin user list.\n\n## Steps to reproduce\n\n1. Sign in as a regular user.\n2. Set the bio to `<img src=x onerror=alert(document.domain)>`.\n3. Sign in as an administrator and open /admin/users.\n\n## Proof of concept\n\nThe alert fires on page load.",
      impact:
        "Any user can run JavaScript in an administrator session and act as that administrator, including changing roles and reading customer data.",
    });
  }
  return prompt.split("Text:\n").at(-1)?.trim() ?? "";
}

function handle(state: MockState, command: string, payload: InvokeArgs | undefined): unknown {
  switch (command) {
    case "auth_status":
      return { username: state.username };
    case "sign_in": {
      if (text(payload, "token") !== "valid-token") throw unauthorized;
      state.username = text(payload, "username");
      return { username: state.username };
    }
    case "sign_out":
      Object.assign(state, initialState());
      return null;
    case "programs_cached":
    case "programs_sync":
      return cached(state.programs);
    case "program_cached":
    case "program_sync": {
      const found = state.programs.find((candidate) => candidate.handle === text(payload, "handle"));
      return cached({
        program: found ?? null,
        scopes: [
          scope("1", "api.acme.com"),
          scope("2", "*.acme.com", { assetType: "WILDCARD", changedSinceLastSync: true }),
          scope("3", "legacy.acme.com", { eligibleForSubmission: false, eligibleForBounty: false }),
        ],
        exclusions: [
          {
            id: "e1",
            category: "Clickjacking",
            details: "On pages without sensitive actions",
            createdAt: null,
            updatedAt: null,
          },
        ],
        weaknesses: [
          {
            id: "60",
            name: "Insecure Direct Object Reference (IDOR)",
            description: null,
            externalId: "cwe-639",
            createdAt: null,
          },
          {
            id: "61",
            name: "Cross-site Scripting (XSS) - Stored",
            description: null,
            externalId: "cwe-79",
            createdAt: null,
          },
        ],
        reportIntents: "unsupported",
      });
    }
    case "program_set_pinned": {
      const found = state.programs.find((candidate) => candidate.handle === text(payload, "handle"));
      if (found) found.pinned = field(payload, "pinned") === true;
      return null;
    }
    case "local_search": {
      const query = text(payload, "query").toLowerCase();
      return state.programs
        .filter(
          (candidate) =>
            String(candidate.name).toLowerCase().includes(query) || String(candidate.handle).includes(query),
        )
        .map((candidate) => ({
          kind: "program",
          reference: candidate.handle,
          program: candidate.handle,
          title: candidate.name,
          detail: candidate.handle,
        }));
    }
    case "reports_cached":
    case "reports_sync":
      return cached(state.reports);
    case "report_cached":
    case "report_sync":
      return state.reports.find((candidate) => candidate.id === text(payload, "id")) ?? null;
    case "report_preview": {
      const input = object(payload, "input");
      return {
        data: {
          type: "report",
          attributes: {
            team_handle: input.teamHandle,
            title: input.title,
            vulnerability_information: input.vulnerabilityInformation,
            impact: input.impact,
            ...(input.severityRating ? { severity_rating: input.severityRating } : {}),
            ...(input.weaknessId ? { weakness_id: Number(input.weaknessId) } : {}),
            ...(input.structuredScopeId ? { structured_scope_id: Number(input.structuredScopeId) } : {}),
          },
        },
      };
    }
    case "report_submit": {
      const input = object(payload, "input");
      state.submitted.push(input);
      const created = report("2001", String(input.title), "new", {
        vulnerabilityInformation: input.vulnerabilityInformation,
        activities: [],
      });
      state.reports.unshift(created);
      return created;
    }
    case "intents_list":
      return state.intents;
    case "hacktivity_cached":
      return null;
    case "hacktivity_fetch": {
      const query = object(payload, "query");
      state.hacktivityQueries.push(String(query.queryString));
      return {
        page: {
          items: state.hacktivity,
          pageNumber: query.pageNumber,
          hasNextPage: false,
        },
        fetchedAt: NOW,
      };
    }
    case "earnings_cached":
    case "earnings_sync":
      return cached({
        balance: { balance: state.balance },
        earnings: state.earnings,
        payouts: state.payouts,
      });
    case "drafts_list":
      return [...state.drafts.values()];
    case "draft_get":
      return state.drafts.get(text(payload, "id")) ?? null;
    case "draft_save": {
      const id = (field(payload, "id") as string | null) ?? `draft-${state.drafts.size + 1}`;
      const existing = state.drafts.get(id);
      const saved = {
        attachments: [],
        intentId: null,
        ...existing,
        ...object(payload, "content"),
        id,
        updatedAt: NOW,
      };
      state.drafts.set(id, saved);
      return saved;
    }
    case "draft_delete":
      state.drafts.delete(text(payload, "id"));
      return null;
    case "templates_list":
      return state.templates;
    case "saved_searches_list":
      return state.searches;
    case "settings_get":
      return state.settings;
    case "settings_save":
      state.settings = object(payload, "settings");
      return state.settings;
    case "open_external":
      return null;
    case "ai_settings_get":
      return state.ai;
    case "ai_settings_save": {
      const apiKey = field(payload, "apiKey");
      const hasKey = typeof apiKey === "string" ? apiKey.trim().length > 0 : Boolean(state.ai.hasKey);
      state.ai = {
        provider: field(payload, "provider"),
        model: text(payload, "model") || "claude-sonnet-5-5",
        baseUrl: field(payload, "baseUrl") ?? null,
        enabled: Boolean(field(payload, "enabled")),
        hasKey,
      };
      return state.ai;
    }
    case "ai_test":
      return { ok: true, model: state.ai.model, latencyMs: 412 };
    case "ai_complete":
      if (!state.ai.enabled)
        throw {
          kind: "ai",
          error: { kind: "disabled" },
          message: "AI assistance is turned off; enable it in Settings",
        };
      return { text: mockCompletion(text(payload, "system"), text(payload, "prompt")) };
    case "program_note_get":
      return state.notes.get(text(payload, "handle")) ?? null;
    case "program_note_save": {
      const note = { body: text(payload, "body"), updatedAt: NOW };
      if (note.body.trim()) state.notes.set(text(payload, "handle"), note);
      else state.notes.delete(text(payload, "handle"));
      return note;
    }
    case "plugin:event|listen":
      return 1;
    case "plugin:event|unlisten":
      return null;
    default:
      throw { kind: "invalid", message: `the mock backend does not implement ${command}` };
  }
}

declare global {
  interface Window {
    __mockBackend?: MockState;
  }
}

export function installMockBackend(): void {
  const state = initialState();
  window.__mockBackend = state;
  mockIPC((command, payload) => handle(state, command, payload));
}
