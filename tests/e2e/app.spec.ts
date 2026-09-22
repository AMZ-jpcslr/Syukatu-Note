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
  await dialog.getByLabel("募集URL").fill("https://example.com/recruit");
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
  await page.getByRole("button", { name: "選考", exact: true }).click();
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
  await page.getByRole("button", { name: "他の就活生にも共有" }).click();
  await expect(dialog.getByText("私の志望動機です。")).toHaveCount(0);
  await dialog.getByLabel("一次面接", { exact: true }).check();
  await dialog
    .getByLabel("募集URLが企業の公式採用ページであることを確認しました")
    .check();
  await dialog.getByRole("button", { name: "この内容で公開する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/templates");
  await page.getByRole("textbox", { name: "公開募集を検索" }).fill("テスト");
  await page.getByRole("button", { name: "コピーして編集" }).click();
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
  await page.getByLabel("CSVファイルを選択").setInputFiles({
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
  await page.getByRole("button", { name: "面接", exact: true }).click();
  await page.getByRole("button", { name: "面接を追加" }).click();
  await dialog.getByLabel("面接日時（日本時間）").fill("2026-09-25T14:00");
  await dialog.getByLabel("選考段階").fill("二次面接");
  await dialog.getByLabel("質問", { exact: true }).fill("大切にしていること");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "面接", exact: true }).click();
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

test("v1.1 workflow automation, saved templates, reports, deadline review and interview pairs", async ({
  page,
}, testInfo) => {
  await page.goto("/companies");
  await page
    .getByRole("button", { name: "企業を追加", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("企業名").fill("v11検証企業");
  await dialog.getByLabel("募集URL").fill("https://example.com/recruit");
  await dialog.getByLabel("応募締切日").fill("2028-10-01");
  await dialog.getByRole("button", { name: "企業を登録", exact: true }).click();
  await page
    .getByRole("link")
    .filter({ hasText: "v11検証企業" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/companies\/[a-f0-9-]+$/);
  const originalUrl = page.url();
  await page.getByRole("button", { name: "選考", exact: true }).click();
  await page.getByRole("button", { name: "ステップを追加" }).click();
  await dialog.getByLabel("タスク名").fill("ES締切");
  await dialog.getByLabel("期限", { exact: true }).fill("2028-09-28");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await page.getByRole("button", { name: "タスク", exact: true }).click();
  await expect(page.getByText("ES提出", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ES提出の完了状態を変更" }).click();
  await page.getByRole("button", { name: "選考", exact: true }).click();
  await expect(page.getByLabel("ES締切の状態")).toHaveValue("完了");
  await page.getByRole("button", { name: "ステップを追加" }).click();
  await dialog.getByLabel("タスク名").fill("一次面接");
  await dialog
    .getByRole("combobox", { name: "種類", exact: true })
    .selectOption("一次面接");
  await dialog.getByLabel("実施日時（日本時間）").fill("2028-09-29T14:00");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await page
    .getByRole("button", { name: "一次面接を上へ", exact: true })
    .click();
  await expect(page.locator(".flow-step h3").first()).toHaveText("一次面接");
  await page.reload();
  await page.getByRole("button", { name: "選考", exact: true }).click();
  await expect(page.locator(".flow-step h3").first()).toHaveText("一次面接");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-v11-flow.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await page.getByRole("button", { name: "設問を追加" }).click();
  await dialog.getByLabel("設問", { exact: true }).fill("学生時代の経験");
  await dialog.getByLabel("回答", { exact: true }).fill("学生時代😀");
  await expect(dialog.getByText("5 / 400 文字")).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "ステータス", exact: true })
    .selectOption("提出済み");
  await dialog
    .getByLabel("提出日時（日本時間・任意）")
    .fill("2028-09-27T13:00");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await page.getByLabel("過去ESを検索（自分の企業すべて）").fill("学生時代");
  await expect(
    page.locator(".es-search").getByText("学生時代😀"),
  ).toBeVisible();
  await page.getByRole("button", { name: "面接", exact: true }).click();
  await page.getByRole("button", { name: "面接を追加" }).click();
  await dialog.getByLabel("面接日時（日本時間）").fill("2028-09-29T14:00");
  await dialog.getByLabel("選考段階").fill("一次面接");
  await dialog.getByLabel("質問", { exact: true }).fill("志望理由は？");
  await dialog
    .getByLabel("自分の回答", { exact: true })
    .fill("事業に関心があります");
  await dialog.getByRole("button", { name: "質問と回答を追加" }).click();
  await dialog.getByLabel("質問 2", { exact: true }).fill("強みは？");
  await dialog.getByLabel("自分の回答 2", { exact: true }).fill("継続力です");
  await dialog.getByLabel("場所・面接URL").fill("本社 3F");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await page.reload();
  await page.getByRole("button", { name: "面接", exact: true }).click();
  await expect(page.getByText("継続力です", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "他の就活生にも共有" }).click();
  await expect(dialog.getByText("継続力です", { exact: true })).toHaveCount(0);
  await dialog
    .getByLabel("募集URLが企業の公式採用ページであることを確認しました")
    .check();
  await dialog.getByLabel("ES締切", { exact: true }).check();
  await dialog.getByRole("button", { name: "この内容で公開する" }).click();
  await page.goto("/templates");
  await page.getByLabel("公開募集を検索").fill("v11検証");
  await expect(page.getByText("未確認", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "気になる", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存済み", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "情報が違う" }).click();
  await dialog.getByLabel("訂正内容").selectOption("締切が違う");
  await dialog.getByRole("button", { name: "報告する", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "応募予定に追加", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "志望度を設定しますか？" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "S", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByLabel("公開募集を検索")).toHaveValue("v11検証");
  const copiedId = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("shukatsu-demo-v1")!);
    return store.applications.find(
      (a: { company_name: string; recruitment_template_id: string | null }) =>
        a.company_name === "v11検証企業" && a.recruitment_template_id,
    ).id;
  });
  await page.goto(`/companies/${copiedId}`);
  await expect(
    page.getByText("応募予定", { exact: true }).first(),
  ).toBeVisible();
  const copiedUrl = page.url();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByText("学生時代😀", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const templates = JSON.parse(
      localStorage.getItem("shukatsu-demo-templates")!,
    );
    const template = templates.find(
      (t: { company_name: string }) => t.company_name === "v11検証企業",
    );
    template.application_deadline = "2028-10-08";
    localStorage.setItem("shukatsu-demo-templates", JSON.stringify(templates));
  });
  await page.goto("/");
  await page.reload();
  await expect(
    page.getByText(/v11検証企業：募集情報が更新されています/),
  ).toBeVisible();
  await page.getByRole("button", { name: "更新を反映", exact: true }).click();
  await expect(dialog.getByText(/2028-10-01.*2028-10-08/)).toBeVisible();
  await dialog.getByRole("button", { name: "この締切を反映" }).click();
  await page.goto(copiedUrl);
  await expect(page.getByText("2028/10/8", { exact: true })).toBeVisible();
  await page.goto(originalUrl);
  await expect(page.getByText("2028/10/1", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("選考ステップからタスクを自動作成").uncheck();
  await page.getByLabel("選考ステップをカレンダーへ自動追加").uncheck();
  await page.reload();
  await expect(
    page.getByLabel("選考ステップからタスクを自動作成"),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("選考ステップをカレンダーへ自動追加"),
  ).not.toBeChecked();
  await page.goto("/templates");
  await page.getByLabel("公開募集を検索").fill("v11検証");
  await expect(
    page.getByRole("heading", { name: "v11検証企業", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-v11-templates.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("bulk citations respect filters, skip existing copies and stay on templates", async ({
  page,
}) => {
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "募集を探す", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const templates = Array.from({ length: 4 }, (_, i) => ({
      id: crypto.randomUUID(),
      company_id: crypto.randomUUID(),
      company_name: `一括検証企業${i + 1}`,
      industry: i < 3 ? "IT" : "金融",
      graduation_year: 2028,
      job_category: "ビジネス",
      position_name: "2028卒 採用情報",
      selection_type: "未発表",
      application_start: null,
      application_deadline: null,
      url: "https://example.com/recruit",
      public: true,
      public_flow: [{ title: "ES提出", step_type: "ES締切" }],
      created_by_user_id: null,
      created_at: "2026-01-01T00:00:00Z",
    }));
    localStorage.setItem("shukatsu-demo-templates", JSON.stringify(templates));
  });
  await page.reload();
  await page.getByLabel("業界で絞り込み").selectOption("IT");
  await expect(page.locator(".template-card")).toHaveCount(3);
  const dialog = page.getByRole("dialog");
  await page
    .getByRole("button", { name: "応募予定に追加", exact: true })
    .nth(0)
    .click();
  await dialog.getByRole("button", { name: "あとで", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/templates$/);
  await page
    .getByRole("button", { name: "応募予定に追加", exact: true })
    .nth(1)
    .click();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/templates$/);
  const bulk = page.getByRole("button", { name: "すべて引用", exact: true });
  await bulk.click();
  await expect(
    page.getByRole("status").filter({ hasText: "1件を応募予定に引用しました" }),
  ).toBeVisible();
  await expect(bulk).toBeDisabled();
  await expect(page.getByLabel("業界で絞り込み")).toHaveValue("IT");
  await expect(page).toHaveURL(/\/templates$/);
  await page.reload();
  await expect(page.locator(".template-card")).toHaveCount(4);
  await bulk.click();
  await expect(bulk).toBeDisabled();
  await expect(page).toHaveURL(/\/templates$/);
  const copied = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("shukatsu-demo-v1")!) as {
      applications: {
        recruitment_template_id: string | null;
        status: string;
        priority: string;
      }[];
    };
    return store.applications.filter(
      (a: { recruitment_template_id: string | null }) =>
        a.recruitment_template_id,
    );
  });
  expect(copied).toHaveLength(4);
  expect(new Set(copied.map((a) => a.recruitment_template_id)).size).toBe(4);
  expect(
    copied.every((a) => a.status === "応募予定" && a.priority === "未設定"),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
