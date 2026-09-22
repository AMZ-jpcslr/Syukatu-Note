import { test, expect } from "@playwright/test";
test("dashboard, company CRUD, tasks, ES, citations, calendar and theme", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "一歩ずつ、未来へ。" }),
  ).toBeVisible();
  await expect(
    page.getByText("デモワークスペース", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.goto("/companies");
  await page
    .getByRole("button", { name: "企業を追加", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("企業名").fill("テスト株式会社");
  await dialog.getByLabel("業界", { exact: true }).fill("IT");
  await dialog.getByLabel("職種", { exact: true }).fill("エンジニア");
  await dialog.getByLabel("応募締切日").fill("2028-11-15");
  await dialog.getByRole("button", { name: "企業を登録", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("link")
    .filter({ hasText: "テスト株式会社" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "テスト株式会社" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "選考フロー", exact: true }).click();
  await page.getByRole("button", { name: "ステップを追加" }).click();
  await dialog.getByLabel("タスク名").fill("一次面接準備");
  await dialog.getByLabel("期限", { exact: true }).fill("2028-11-14");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(
    page.getByRole("heading", { name: "一次面接準備" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "タスク", exact: true }).click();
  await page.getByRole("button", { name: "タスクを追加" }).click();
  await dialog.getByLabel("タスク名").fill("テスト用ESを書く");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await page
    .getByRole("button", { name: "テスト用ESを書くの完了状態を変更" })
    .click();
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await page.getByRole("button", { name: "設問を追加" }).click();
  await dialog
    .getByLabel("設問", { exact: true })
    .fill("志望動機を教えてください");
  await dialog.getByLabel("回答", { exact: true }).fill("私の志望動機です。");
  await expect(dialog.getByText("9 / 400 文字")).toBeVisible();
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByText("私の志望動機です。")).toBeVisible();
  await page.getByRole("button", { name: "募集を公開" }).click();
  await expect(dialog.getByText("私の志望動機です。")).toHaveCount(0);
  await dialog.getByLabel("一次面接", { exact: true }).check();
  await dialog.getByRole("button", { name: "この内容で公開する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/templates");
  await page.getByRole("textbox", { name: "公開募集を検索" }).fill("テスト");
  await page.getByRole("button", { name: "引用して編集" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("企業名").fill("引用後の企業");
  await dialog.getByRole("button", { name: "変更を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "引用後の企業" }),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "カレンダー", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "週", exact: true }).click();
  await page.getByRole("button", { name: "リスト", exact: true }).click();
  await page.getByRole("button", { name: "月", exact: true }).click();
  await page.goto("/settings");
  await page
    .getByRole("combobox", { name: "テーマ", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-dark-settings.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("CSV preview, filtering, interview persistence, calendar links and deletion", async ({
  page,
}) => {
  await page.goto("/settings");
  const sample =
    "company_name,industry,graduation_year,job_category,position_name,course_name,selection_type,application_start,application_deadline,url,location,priority,status,memo,tags,selection_steps,tasks\nCSV検証企業,金融,2029,企画職,2029卒,,本選考,,,,東京,S,応募予定,個人メモ,金融,[],[]\n";
  await page
    .getByLabel("CSVファイルを選択")
    .setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(sample),
    });
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("1社・選考0件・タスク0件を新規追加します。"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "インポートする" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/companies");
  await page.getByRole("textbox", { name: "企業を検索" }).fill("CSV検証");
  await expect(
    page.getByRole("link").filter({ hasText: "CSV検証企業" }),
  ).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "業界", exact: true })
    .selectOption("IT・SaaS");
  await expect(page.getByText("条件に一致する企業がありません")).toBeVisible();
  await page
    .getByRole("combobox", { name: "業界", exact: true })
    .selectOption("");
  await page.getByRole("link").filter({ hasText: "CSV検証企業" }).click();
  await page.getByRole("button", { name: "面接メモ", exact: true }).click();
  await page.getByRole("button", { name: "面接を追加" }).click();
  await dialog.getByLabel("面接日時（日本時間）").fill("2026-09-25T14:00");
  await dialog.getByLabel("選考段階").fill("二次面接");
  await dialog.getByLabel("質問", { exact: true }).fill("大切にしていること");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "面接メモ", exact: true }).click();
  await expect(page.getByText("大切にしていること")).toBeVisible();
  await expect(page.getByText(/2026\/9\/25 14:00/)).toBeVisible();
  await page.goto("/calendar");
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  const event = page
    .locator(".fc-event")
    .filter({ hasText: "マネーフォワード" })
    .first();
  await event.click();
  await expect(
    page.getByRole("heading", { name: "マネーフォワード", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSVをエクスポート" }).click();
  expect((await download).suggestedFilename()).toMatch(/shukatsu-.*\.csv/);
  await page.goto("/companies");
  await page.getByRole("textbox", { name: "企業を検索" }).fill("CSV検証");
  await page.getByRole("link").filter({ hasText: "CSV検証企業" }).click();
  await page.getByRole("button", { name: "この企業を削除" }).click();
  await dialog.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page).toHaveURL(/\/companies$/);
  await page.getByRole("textbox", { name: "企業を検索" }).fill("CSV検証");
  await expect(page.getByText("条件に一致する企業がありません")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
