import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectVisiblePage } from "../../packages/browser-extension/src/collect-visible";
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>MIXI | マイページ</title></head><body><main><h1>MIXI 2028卒 エンジニア職</h1><p>本選考</p><p>本エントリーシートの初回提出期限は【2026/9/28(月) 23:59 JST】までです。</p><h2>選考フロー</h2><p>ES → Webテスト → 一次面接 → 最終面接</p><input value="PRIVATE_NAME"><input type="password" value="PRIVATE_PASSWORD"><input type="hidden" value="PRIVATE_CSRF"><textarea>PRIVATE_ES</textarea><section><h2>回答内容</h2><p>PRIVATE_ESSAY</p></section><div hidden>PRIVATE_HIDDEN</div><div style="display:none">PRIVATE_CSS_HIDDEN</div><p>メールアドレス: private@example.com</p></main><script>window.PRIVATE_SESSION='secret'</script></body></html>`;
test("DOM sanitizer excludes input, ES display blocks and hidden data", async ({
  page,
}) => {
  await page.setContent(fixture);
  const data = await page.evaluate(collectVisiblePage, false);
  expect(data.text).not.toMatch(/PRIVATE_/);
  expect(data.text).toContain("2026/9/28");
});
test("text import → inbox approval → exact calendar deadline and task", async ({
  page,
}) => {
  await page.goto("/inbox");
  await page.getByLabel("企業名（分かる場合）").fill("MIXI");
  await page
    .getByLabel("取り込むテキスト")
    .fill(
      "2028卒 エンジニア職 本選考\n本エントリーシートの初回提出期限は【2026/9/28(月) 23:59 JST】までです。\n選考フロー\nES → Webテスト → 一次面接 → 最終面接",
    );
  await page.getByRole("button", { name: "この端末で解析する" }).click();
  await expect(
    page.getByRole("heading", { name: "送信内容の確認" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "この抽出結果をInboxに保存" }).click();
  await expect(
    page.getByRole("button", { name: "確認して反映" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/v2-inbox.png", fullPage: true });
  await page.getByRole("button", { name: "確認して反映" }).click();
  await expect(page.getByText("確認待ち 0件", { exact: true })).toBeVisible();
  await page.goto("/tasks");
  await expect(
    page.getByRole("link").filter({ hasText: "MIXI" }),
  ).toContainText("ES提出");
  await page.goto("/calendar");
  await expect(
    page.locator(".fc-event").filter({ hasText: "MIXI" }).first(),
  ).toBeVisible();
  await page.goto("/planner");
  await page.getByLabel("使える時間", { exact: true }).fill("120");
  await expect(
    page.getByRole("heading", { name: /今日のプラン/ }),
  ).toBeVisible();
});
test("built MV3 extension parses SNAR fixture and sends only sanitized candidates", async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "extension runs on desktop Chromium only",
  );
  const temp = await mkdtemp(path.join(tmpdir(), "career-extension-")),
    extension = path.join(temp, "extension");
  await mkdir(extension);
  await cp("packages/browser-extension/dist", extension, { recursive: true });
  // The production manifest keeps activeTab only. Extra host access is confined to this local fixture build.
  const manifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions.push("https://mixi-recruit.snar.jp/*");
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const context = await chromium.launchPersistentContext(
    path.join(temp, "profile"),
    {
      channel: process.env.EXTENSION_TEST_CHANNEL ?? "chromium",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    await context.route("https://mixi-recruit.snar.jp/**", (route) =>
      route.fulfill({ contentType: "text/html", body: fixture }),
    );
    let payload: unknown;
    await context.route(
      "https://syukatu-note.vercel.app/api/import/browser-page",
      async (route) => {
        payload = route.request().postDataJSON();
        await route.fulfill({
          contentType: "application/json",
          body: '{"success":true,"id":"fixture"}',
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    );
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        privacyAccepted: true,
        token: "EXT-" + "a".repeat(64),
      });
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const site = await context.newPage();
    await site.goto(
      "https://mixi-recruit.snar.jp/mypage?session=PRIVATE_SESSION",
    );
    await site.bringToFront();
    await popup.evaluate(() => {
      (
        Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("このページから"),
        ) as HTMLButtonElement
      ).click();
    });
    await expect(
      popup.getByText("2026-09-28T23:59:00+09:00", { exact: true }),
    ).toBeVisible();
    await popup.setViewportSize({ width: 390, height: 1000 });
    await popup.screenshot({
      path: "test-results/v2-extension.png",
      fullPage: true,
    });
    await popup
      .getByRole("button", { name: "しゅうかつ手帳に送る", exact: true })
      .click();
    await expect(popup.getByRole("status")).toContainText("Inboxへ送りました");
    expect(JSON.stringify(payload)).not.toMatch(
      /PRIVATE_|private@example|Cookie|session=/,
    );
    expect(payload).toMatchObject({
      companyName: "MIXI",
      parserProvider: "snar",
    });
  } finally {
    await context.close();
  }
});
