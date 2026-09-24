import { mkdir } from "node:fs/promises";
import { test, expect, devices, type Page } from "@playwright/test";
import companies from "./recruitment-companies.json" with { type: "json" };
import type { Store, Template } from "../src/lib/types";

const output = "docs/images";

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${output}/${name}.png`,
    animations: "disabled",
    fullPage: ["calendar", "calendar-dark", "selection-flow"].includes(name),
    // Hide only Next.js development tools; the app UI is unchanged.
    style: "nextjs-portal { visibility: hidden !important; }",
  });
}

test("capture README screens using an isolated local demo", async ({
  page,
  browser,
}) => {
  await mkdir(output, { recursive: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "一歩ずつ、未来へ。" }),
  ).toBeVisible();
  await expect(
    page.getByText("デモワークスペース", { exact: false }),
  ).toBeVisible();
  await page.evaluate((catalog) => {
    // Reuse the seed catalog as unverified monitoring placeholders, with no invented dates.
    const templates: Template[] = catalog.map((company) => ({
      id: crypto.randomUUID(),
      company_id: crypto.randomUUID(),
      company_name: company.name,
      industry: company.industry,
      tags: company.tags,
      aliases: company.aliases,
      graduation_year: 2028,
      job_category: "",
      position_name: "2028卒 採用情報",
      selection_type: "未発表",
      application_start: null,
      application_deadline: null,
      application_status: "unknown",
      verification_status: "unverified",
      last_verified_at: null,
      source_type: "official",
      source_url: company.url,
      url: company.url,
      notes_public:
        "採用情報を確認するための監視テンプレートです。募集内容・日程は要確認。",
      public: true,
      public_flow: [],
      created_by_user_id: null,
      created_at: new Date().toISOString(),
    }));
    localStorage.setItem("shukatsu-demo-templates", JSON.stringify(templates));
  }, companies);
  await capture(page, "dashboard");

  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "カレンダー", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fc-event").first()).toBeVisible();
  await capture(page, "calendar");

  await page.goto("/companies");
  await expect(
    page.getByRole("link").filter({ hasText: "事業企画職" }).first(),
  ).toBeVisible();
  await capture(page, "companies");
  const applicationId = await page.evaluate(() => {
    const store: Store = JSON.parse(localStorage.getItem("shukatsu-demo-v1")!);
    return store.applications[0].id;
  });
  await page.goto(`/companies/${applicationId}`);
  await page.getByRole("button", { name: "選考", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "エントリーシート提出", exact: true }),
  ).toBeVisible();
  await capture(page, "selection-flow");

  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "Money Forward", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1530 });
  await capture(page, "templates");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    storageState: await page.context().storageState(),
    colorScheme: "light",
  });
  try {
    const mobilePage = await mobile.newPage();
    await mobilePage.goto("http://localhost:3100/calendar");
    await expect(mobilePage.locator(".fc-event").first()).toBeVisible();
    await mobilePage
      .getByRole("button", { name: "リスト", exact: true })
      .click();
    await expect(mobilePage.locator(".fc-list-event").first()).toBeVisible();
    await capture(mobilePage, "mobile-calendar");
  } finally {
    await mobile.close();
  }

  await page.goto("/settings");
  await page.getByLabel("テーマ", { exact: true }).selectOption("dark");
  await page.goto("/calendar");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".fc-event").first()).toBeVisible();
  await capture(page, "calendar-dark");
});
