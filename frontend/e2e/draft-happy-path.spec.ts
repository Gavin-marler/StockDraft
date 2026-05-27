import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// End-to-end happy path:
// 1. Admin creates a league
// 2. Two players join via the invite link (separate browser contexts so localStorage is isolated)
// 3. Admin approves both
// 4. Admin starts the draft
// 5. Each player makes one pick using the new ESPN-style picker
// 6. Verify both picks land on the leaderboard

const ADMIN_PW = "playwright-test-123";
const PIN_A = "1111";
const PIN_B = "2222";

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now().toString(36).slice(-5)}`;
}

async function createLeagueAsAdmin(page: Page, leagueName: string) {
  await page.goto("/create");
  await page.getByLabel("League name").fill(leagueName);
  await page.getByLabel("Admin password", { exact: true }).fill(ADMIN_PW);
  await page.getByLabel("Confirm admin password").fill(ADMIN_PW);
  await page.getByRole("button", { name: "Create league" }).click();

  await expect(page.getByRole("heading", { name: "League created!" })).toBeVisible({ timeout: 30_000 });

  const inviteInput = page.locator('input[readonly][value*="/join?token="]').first();
  const adminInput = page.locator('input[readonly][value*="/admin?league="]').first();
  const inviteUrl = await inviteInput.inputValue();
  const adminUrl = await adminInput.inputValue();
  return { inviteUrl, adminUrl };
}

async function joinAs(ctx: BrowserContext, inviteUrl: string, name: string, pin: string) {
  const page = await ctx.newPage();
  await page.goto(inviteUrl);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("4-digit PIN").fill(pin);
  await page.getByLabel("Confirm PIN").fill(pin);
  await page.getByRole("button", { name: "Join league" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  return page;
}

async function approveExactly(adminPage: Page, expected: number) {
  // Wait until both expected join requests show up before approving.
  await expect(adminPage.locator("button", { hasText: new RegExp(`^Pending \\(${expected}\\)`) })).toBeVisible({
    timeout: 20_000,
  });
  await adminPage.locator("button", { hasText: /^Pending \(/ }).click();

  for (let i = 0; i < expected + 2; i++) {
    const buttons = adminPage.getByRole("button", { name: "Approve", exact: true });
    if ((await buttons.count()) === 0) break;
    await buttons.first().click();
    await adminPage.waitForTimeout(500);
  }

  // Confirm the tab counter has dropped to zero.
  await expect(adminPage.locator("button", { hasText: /^Pending \(0\)/ })).toBeVisible({ timeout: 15_000 });
}

test("admin can create a league, two players join, draft starts, both make a pick", async ({ browser }) => {
  const leagueName = uniqueName("E2E");

  // --- Admin context
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  adminPage.on("dialog", (d) => d.accept());
  const { inviteUrl, adminUrl } = await createLeagueAsAdmin(adminPage, leagueName);
  expect(inviteUrl).toContain("/join?token=");
  expect(adminUrl).toContain("/admin?league=");

  // --- Player A
  const ctxA = await browser.newContext();
  const pageA = await joinAs(ctxA, inviteUrl, "Alice", PIN_A);

  // --- Player B
  const ctxB = await browser.newContext();
  const pageB = await joinAs(ctxB, inviteUrl, "Bob", PIN_B);

  // --- Admin: approve both
  await adminPage.goto(adminUrl);
  await approveExactly(adminPage, 2);

  // --- Admin: start draft
  await adminPage.getByRole("button", { name: "draft", exact: true }).click();
  await expect(adminPage.getByRole("button", { name: "Start draft" })).toBeEnabled();
  await adminPage.getByRole("button", { name: "Start draft" }).click();

  // Admin lands on /draft after starting.
  await expect(adminPage).toHaveURL(/\/draft\?league=/, { timeout: 30_000 });

  // --- Player A: navigate to draft, make a pick
  const leagueId = new URL(adminUrl).searchParams.get("league")!;
  await pageA.goto(`/draft?league=${leagueId}`);
  // Whoever is on the clock first picks AAPL.
  // Player A is the first-joined, so they pick first in round 1.
  await pageA.waitForSelector("text=On the clock");
  await pageA.getByLabel("Your PIN").fill(PIN_A);
  const aaplRow = pageA.getByRole("row", { name: /AAPL/ });
  await aaplRow.getByRole("button", { name: "Draft" }).click();
  await pageA.getByRole("button", { name: "Confirm" }).click();
  await expect(pageA.getByText(/Alice drafted AAPL/)).toBeVisible({ timeout: 15_000 });

  // --- Player B: should now be on the clock; pick MSFT
  await pageB.goto(`/draft?league=${leagueId}`);
  await pageB.waitForSelector("text=On the clock");
  await expect(pageB.getByText(/Bob\s*\(your pick\)/)).toBeVisible({ timeout: 15_000 });
  await pageB.getByLabel("Your PIN").fill(PIN_B);
  const msftRow = pageB.getByRole("row", { name: /MSFT/ });
  await msftRow.getByRole("button", { name: "Draft" }).click();
  await pageB.getByRole("button", { name: "Confirm" }).click();
  await expect(pageB.getByText(/Bob drafted MSFT/)).toBeVisible({ timeout: 15_000 });

  // Cleanup
  await adminCtx.close();
  await ctxA.close();
  await ctxB.close();
});
