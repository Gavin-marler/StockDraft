import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// End-to-end happy path. Requires SUPABASE_SERVICE_ROLE_KEY in the env so we can
// seed test users via the admin API (bypassing magic-link email flow).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const PASSWORD = "playwright-e2e-password";

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  throw new Error(
    "Missing env. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY before running.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function uniqueEmail(prefix: string) {
  return `e2e-${prefix}-${Date.now().toString(36).slice(-5)}@stockdraft.test`;
}

async function seedUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user!.id;
}

async function signIn(ctx: BrowserContext, email: string) {
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(
    async ({ url, key, email, password }) => {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
      const sb = createClient(url, key, {
        auth: { persistSession: true, storageKey: "stockdraft-auth" },
      });
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    { url: SUPABASE_URL, key: ANON_KEY, email, password: PASSWORD },
  );
  return page;
}

test("admin creates league, two players join, draft starts, both pick", async ({ browser }) => {
  const adminEmail = uniqueEmail("admin");
  const aliceEmail = uniqueEmail("alice");
  const bobEmail = uniqueEmail("bob");
  const seeded = await Promise.all([seedUser(adminEmail), seedUser(aliceEmail), seedUser(bobEmail)]);

  // --- Admin: create league
  const adminCtx = await browser.newContext();
  const adminPage = await signIn(adminCtx, adminEmail);
  adminPage.on("dialog", (d) => d.accept());
  await adminPage.goto("/create");
  const leagueName = `E2E-${Date.now().toString(36).slice(-5)}`;
  await adminPage.getByLabel("League name").fill(leagueName);
  await adminPage.getByRole("button", { name: "Create league" }).click();
  await expect(adminPage.getByRole("heading", { name: "League created!" })).toBeVisible({ timeout: 30_000 });

  const inviteUrl = await adminPage.locator('input[readonly][value*="/join?token="]').first().inputValue();
  const adminUrl = await adminPage.locator('input[readonly][value*="/admin?league="]').first().inputValue();
  const leagueId = new URL(adminUrl).searchParams.get("league")!;

  // --- Players: sign in then join
  const aliceCtx = await browser.newContext();
  const alicePage = await signIn(aliceCtx, aliceEmail);
  await alicePage.goto(inviteUrl);
  await alicePage.getByLabel("Display name").fill("Alice");
  await alicePage.getByRole("button", { name: "Request to join" }).click();
  await expect(alicePage.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();

  const bobCtx = await browser.newContext();
  const bobPage = await signIn(bobCtx, bobEmail);
  await bobPage.goto(inviteUrl);
  await bobPage.getByLabel("Display name").fill("Bob");
  await bobPage.getByRole("button", { name: "Request to join" }).click();
  await expect(bobPage.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();

  // --- Admin: approve both
  await adminPage.goto(adminUrl);
  await expect(adminPage.locator("button", { hasText: /^Pending \(2\)/ })).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 4; i++) {
    const buttons = adminPage.getByRole("button", { name: "Approve", exact: true });
    if ((await buttons.count()) === 0) break;
    await buttons.first().click();
    await adminPage.waitForTimeout(500);
  }
  await expect(adminPage.locator("button", { hasText: /^Pending \(0\)/ })).toBeVisible();

  // --- Admin: start draft
  await adminPage.getByRole("button", { name: "draft", exact: true }).click();
  await expect(adminPage.getByRole("button", { name: "Start draft" })).toBeEnabled();
  await adminPage.getByRole("button", { name: "Start draft" }).click();
  await expect(adminPage).toHaveURL(/\/draft\?league=/, { timeout: 30_000 });

  // --- Alice picks first
  await alicePage.goto(`/draft?league=${leagueId}`);
  await alicePage.waitForSelector("text=On the clock");
  const aaplRow = alicePage.getByRole("row", { name: /AAPL/ });
  await aaplRow.getByRole("button", { name: "Draft" }).click();
  await alicePage.getByRole("button", { name: "Confirm" }).click();
  await expect(alicePage.getByText(/Alice drafted AAPL/)).toBeVisible({ timeout: 15_000 });

  // --- Bob picks second
  await bobPage.goto(`/draft?league=${leagueId}`);
  await bobPage.waitForSelector("text=On the clock");
  await expect(bobPage.getByText(/Bob\s*\(your pick\)/)).toBeVisible({ timeout: 15_000 });
  const msftRow = bobPage.getByRole("row", { name: /MSFT/ });
  await msftRow.getByRole("button", { name: "Draft" }).click();
  await bobPage.getByRole("button", { name: "Confirm" }).click();
  await expect(bobPage.getByText(/Bob drafted MSFT/)).toBeVisible({ timeout: 15_000 });

  // Cleanup
  await Promise.all([adminCtx.close(), aliceCtx.close(), bobCtx.close()]);
  await Promise.all(seeded.map((id) => admin.auth.admin.deleteUser(id)));
});
