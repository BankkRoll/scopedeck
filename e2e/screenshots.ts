import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:1422";
const out = process.argv[3] ?? "docs/screenshots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.getByLabel("HackerOne username").waitFor({ timeout: 90_000 });
await page.screenshot({ path: `${out}/onboarding.png` });
await page.getByLabel("HackerOne username").fill("researcher");
await page.getByLabel("API token").fill("valid-token");
await page.getByRole("button", { name: "Connect" }).click();
await page.getByRole("heading", { name: "Programs" }).waitFor();
await page.screenshot({ path: `${out}/programs.png` });
await page.getByRole("region", { name: "Programs" }).getByText("Acme Corp").click();
await page.getByText("api.acme.com").waitFor();
await page.screenshot({ path: `${out}/program.png` });
await page.evaluate((hash) => {
  location.hash = hash;
}, "#/compose?program=acme");
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
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/composer.png` });
await page.evaluate((hash) => {
  location.hash = hash;
}, "#/reports/1001");
await page.getByRole("region", { name: "Activity" }).waitFor();
await page.screenshot({ path: `${out}/report.png` });
await page.evaluate((hash) => {
  location.hash = hash;
}, "#/hacktivity");
await page.getByText("SSRF in PDF renderer").waitFor();
await page.screenshot({ path: `${out}/hacktivity.png` });
await page.evaluate((hash) => {
  location.hash = hash;
}, "#/earnings");
await page.getByRole("figure", { name: /Last 12 months/ }).waitFor();
await page.screenshot({ path: `${out}/earnings.png` });
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/earnings-light.png` });
await browser.close();
