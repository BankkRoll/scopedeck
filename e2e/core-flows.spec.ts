import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

test("onboarding rejects bad credentials, then connects with a valid token", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect your HackerOne API token" })).toBeVisible();
  await page.getByLabel("HackerOne username").fill("researcher");
  await page.getByLabel("API token").fill("wrong-token");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("alert")).toContainText("HackerOne rejected your API credentials");

  await signIn(page);
  await expect(page.getByRole("link", { name: "researcher" })).toBeVisible();
});

test("browses a program, its scope, exclusions and sanitized policy", async ({ signedIn: page }) => {
  await page.getByRole("region", { name: "Programs" }).getByText("Acme Corp").click();
  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
  await expect(page.getByText("api.acme.com")).toBeVisible();
  await expect(page.getByText("legacy.acme.com")).toBeHidden();
  await expect(page.getByText("New", { exact: true })).toBeVisible();

  await page.getByRole("switch", { name: "Only assets accepting submissions" }).click();
  await expect(page.getByText("legacy.acme.com")).toBeVisible();

  await page.getByRole("tab", { name: /Exclusions/ }).click();
  await expect(page.getByText("Clickjacking")).toBeVisible();

  await page.getByRole("tab", { name: "Policy" }).click();
  await expect(page.getByRole("heading", { name: "Acme Corp policy" })).toBeVisible();
  await expect(page.locator("script", { hasText: "alert(1)" })).toHaveCount(0);
});

test("composes a report, reviews the exact payload and submits it", async ({ signedIn: page }) => {
  await page.getByRole("link", { name: "New report" }).click();
  await expect(page.getByRole("heading", { name: "New report" })).toBeVisible();
  await pick(page, "Program", "Acme Corp");
  await expect(page.getByLabel("Asset")).toBeEnabled();
  await page.getByLabel("Asset").click();
  await expect(page.getByRole("option", { name: "legacy.acme.com" })).toHaveCount(0);
  await page.getByRole("option", { name: "api.acme.com" }).click();
  await pick(page, "Weakness", "Insecure Direct Object Reference (IDOR)");
  await page.getByRole("radio", { name: "High" }).click();
  await page.getByPlaceholder("Report title").fill("IDOR on invoice export");

  await page
    .getByRole("textbox", { name: "Vulnerability information" })
    .fill("1. Request /invoices/2 as user 1");
  await page.getByRole("tab", { name: "Impact" }).click();
  await page.getByRole("textbox", { name: "Impact" }).fill("Any user can read every invoice.");

  await page.getByRole("button", { name: /Review and submit/ }).click();
  await expect(page.getByText("Confirm the finding is not in the excluded category.")).toBeVisible();
  await page.getByRole("checkbox", { name: /Clickjacking/ }).check();

  await page.getByRole("button", { name: /Review and submit/ }).click();
  const dialog = page.getByRole("dialog", { name: "Review and submit" });
  await expect(dialog.locator("pre")).toContainText('"team_handle": "acme"');
  await expect(dialog.locator("pre")).toContainText('"structured_scope_id": 1');
  await expect(dialog.locator("pre")).toContainText('"severity_rating": "high"');

  const submit = dialog.getByRole("button", { name: "Submit report" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await submit.click();

  await expect(page.getByRole("heading", { name: "IDOR on invoice export" })).toBeVisible();
  const submitted = await page.evaluate(() => window.__mockBackend?.submitted.length);
  expect(submitted).toBe(1);
});

test("imports a finding from JSON and flags fields it cannot match", async ({ signedIn: page }) => {
  await page.goto("/#/compose?program=acme");
  await expect(page.getByLabel("Asset")).toBeEnabled();
  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.getByLabel(/Drop a .json file/).fill(
    JSON.stringify({
      schemaVersion: 1,
      title: "SSRF via webhook URL",
      asset: "https://hooks.example.net",
      weakness: { cwe: "CWE-918" },
      severity: "critical",
      steps: ["Set the webhook to http://169.254.169.254/"],
      impact: "Cloud credentials exposure.",
    }),
  );
  const fields = page.getByRole("list", { name: "Fields that need attention" });
  await expect(fields).toContainText("not in this program's scope");
  await expect(fields).toContainText("not one of this program's weaknesses");
  await page.getByRole("button", { name: "Import with flagged fields" }).click();
  await expect(page.getByPlaceholder("Report title")).toHaveValue("SSRF via webhook URL");
});

test("opens a report with its activity timeline", async ({ signedIn: page }) => {
  await page.getByRole("link", { name: "Reports" }).click();
  await page
    .getByRole("region", { name: "Reports" })
    .getByText("IDOR exposes other tenants' invoices")
    .click();
  await expect(page.getByRole("heading", { name: "IDOR exposes other tenants' invoices" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity" })).toContainText(
    "Thanks, we are looking into this.",
  );
  await expect(page.getByRole("button", { name: "Reply on HackerOne" })).toBeVisible();
});

test("searches hacktivity with the query builder", async ({ signedIn: page }) => {
  await page.getByRole("link", { name: "Hacktivity" }).click();
  await expect(page.getByText("SSRF in PDF renderer")).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("group", { name: "Severity" }).getByRole("button", { name: "Critical" }).click();
  await sheet.getByLabel("Program handle").fill("acme");
  await expect(sheet.getByLabel("Compiled query")).toHaveText(
    "disclosed:true AND severity_rating:critical AND team:acme",
  );
  await sheet.getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__mockBackend?.hacktivityQueries.at(-1)))
    .toBe("disclosed:true AND severity_rating:critical AND team:acme");
  await expect(page.getByRole("button", { name: /Remove filter Severity: Critical/ })).toBeVisible();
});

test("filters programs from the sheet and switches between cards and list", async ({ signedIn: page }) => {
  const programs = page.getByRole("region", { name: "Programs" });
  await expect(programs.getByText("Globex", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("group", { name: "Program type" }).getByRole("button", { name: /VDP/ }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(programs.getByText("Acme Corp", { exact: true })).toBeHidden();
  await expect(programs.getByText("Globex", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("columnheader", { name: "Program" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(programs.getByText("Acme Corp", { exact: true })).toBeVisible();
});

test("opens the command palette and jumps to a program", async ({ signedIn: page }) => {
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Jump to a program, asset, report or action").fill("glob");
  await page.getByRole("option", { name: /Globex/ }).click();
  await expect(page.getByRole("heading", { name: "Globex" })).toBeVisible();
});
