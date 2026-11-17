import { readFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { demoEarnings, demoHacktivity, demoIntents, demoPrograms, demoReports } from "./demo-data.ts";

/**
 * Regenerates docs/screenshots against the e2e mock backend.
 *
 * Usage: node --experimental-strip-types e2e/screenshots.ts [baseUrl] [outDir] [programs.json]
 *
 * The optional programs file is a `sqlite3 -json` export of `select body from programs` from a
 * local cache. Only public programs are used, with every per-user field cleared, so the
 * screenshot shows real program names and logos without any account's activity.
 */

const base = process.argv[2] ?? "http://localhost:1422";
const out = process.argv[3] ?? "docs/screenshots";
const programsFile = process.argv[4];

function publicPrograms(path: string): Record<string, unknown>[] {
  const rows = JSON.parse(readFileSync(path, "utf8")) as { body: string }[];
  return rows
    .map((row) => JSON.parse(row.body) as Record<string, unknown>)
    .filter((program) => program.state === "public_mode")
    .map((program) => ({
      ...program,
      pinned: false,
      numberOfReportsForUser: null,
      numberOfValidReportsForUser: null,
      bountyEarnedForUser: null,
      lastInvitationAcceptedAtForUser: null,
      bookmarked: null,
    }));
}

async function go(page: Page, hash: string) {
  await page.evaluate((target) => {
    location.hash = target;
  }, hash);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.getByLabel("HackerOne username").waitFor({ timeout: 90_000 });
await page.screenshot({ path: `${out}/onboarding.png` });

await page.getByLabel("HackerOne username").fill("researcher");
await page.getByLabel("API token").fill("valid-token");
await page.getByRole("button", { name: "Connect" }).click();
await page.getByRole("heading", { name: "Programs" }).waitFor();

const templates = await page.evaluate(() => {
  const backend = window.__mockBackend;
  return {
    program: backend?.programs[0] ?? {},
    report: backend?.reports[0] ?? {},
    item: backend?.hacktivity[0] ?? {},
  };
});
await page.evaluate(
  (demo) => {
    const backend = window.__mockBackend;
    if (!backend) throw new Error("mock backend missing");
    backend.programs.push(...demo.programs);
    backend.reports.push(...demo.reports);
    backend.hacktivity.push(...demo.hacktivity);
    backend.intents = demo.intents;
    backend.earnings = demo.money.earnings;
    backend.payouts = demo.money.payouts;
    backend.balance = demo.money.balance;
  },
  {
    programs: demoPrograms(templates.program),
    reports: demoReports(templates.report),
    hacktivity: demoHacktivity(templates.item),
    intents: demoIntents(),
    money: demoEarnings(),
  },
);

await page
  .getByRole("button", { name: /sync|refresh/i })
  .first()
  .click();
await page.getByText("Northwind Traders").first().waitFor();

await go(page, "#/programs/acme");
await page.getByText("api.acme.com").waitFor();
await settle(page);
await page.screenshot({ path: `${out}/program.png` });

await go(page, "#/compose?program=acme");
await page.getByRole("heading", { name: "New report" }).waitFor();
await page.getByLabel("Asset", { exact: true }).click();
await page.getByRole("option", { name: "api.acme.com" }).click();
await page.getByRole("radio", { name: "High" }).click();
await page.getByPlaceholder("Report title").fill("IDOR on invoice export");
await page
  .getByRole("textbox", { name: "Vulnerability information" })
  .fill(
    "## Steps\n\n1. Log in as user A\n2. Request `/invoices/2`\n\n```http\nGET /invoices/2 HTTP/1.1\n```",
  );
await settle(page);
await page.screenshot({ path: `${out}/composer.png` });

await go(page, "#/reports/2002");
await page.getByRole("region", { name: "Activity" }).waitFor();
await settle(page);
await page.screenshot({ path: `${out}/report.png` });

await go(page, "#/reports");
await page.getByText("Stored XSS in invoice notes renders for admins").waitFor();
await settle(page);
await page.screenshot({ path: `${out}/reports.png` });

await go(page, "#/intents");
await page.getByText("Stored XSS in comment preview").waitFor();
await settle(page);
await page.screenshot({ path: `${out}/intents.png` });

await go(page, "#/hacktivity");
await page.getByText("Full read SSRF via PDF generator").waitFor();
await settle(page);
await page.screenshot({ path: `${out}/hacktivity.png` });

await go(page, "#/earnings");
await page.getByRole("figure", { name: /Last 12 months/ }).waitFor();
await settle(page);
await page.screenshot({ path: `${out}/earnings.png` });

if (programsFile) {
  const programs = publicPrograms(programsFile);
  await page.evaluate((rows) => {
    const backend = window.__mockBackend;
    if (backend) backend.programs = rows;
  }, programs);
}
await go(page, "#/programs");
await page.getByRole("heading", { name: "Programs" }).waitFor();
await page
  .getByRole("button", { name: /sync|refresh/i })
  .first()
  .click();
await settle(page);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/programs.png` });

await page.getByRole("button", { name: "Filters" }).click();
const sheet = page.getByRole("dialog", { name: "Filters" });
await sheet
  .getByRole("group", { name: "Program type" })
  .getByRole("button", { name: /Bounty/ })
  .click();
await sheet
  .getByRole("group", { name: "Perks" })
  .getByRole("button", { name: /Fast payments/ })
  .click();
await sheet
  .locator(".overflow-y-auto")
  .first()
  .evaluate((element) => {
    element.scrollTop = 0;
  });
await settle(page);
await page.screenshot({ path: `${out}/filters.png` });
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "List view" }).click();
await page.keyboard.press("Control+b");
await settle(page);
await page.screenshot({ path: `${out}/programs-list.png` });
await page.keyboard.press("Control+b");

await go(page, "#/earnings");
await page.getByRole("figure", { name: /Last 12 months/ }).waitFor();
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
await settle(page);
await page.screenshot({ path: `${out}/earnings-light.png` });
await browser.close();
