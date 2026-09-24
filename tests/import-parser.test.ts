import { refineImport, importAIInput } from "../src/services/import-ai";
import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePage, sanitizeExtraction } from "../src/lib/import/parser";
import { cleanSourceUrl, cleanText } from "../src/lib/import/sanitize";
import { extractDates } from "../src/services/recruitment-rule-parser";
import { planToday, matchProfile } from "../src/lib/import/planner";
import {
  encryptToken,
  decryptToken,
  mailText,
  gmailConfigured,
} from "../src/services/gmail";
import type { Application, Task } from "../src/lib/types";
const snar =
  "本エントリーシートの初回提出期限は【2026/9/28(月) 23:59 JST】までです。";
it("SNAR exact ES deadline, evidence and cohort", () => {
  const r = parsePage({
    text: "2028卒 エンジニア職 本選考\n" + snar,
    title: "MIXI | マイページ",
    url: "https://mixi-recruit.snar.jp/mypage?sessionId=SECRET",
  });
  expect(r.companyName).toBe("MIXI");
  expect(r.graduationYear).toBe(2028);
  expect(r.deadlines[0]).toMatchObject({
    type: "ES_DEADLINE",
    date: "2026-09-28T23:59:00+09:00",
  });
  expect(r.deadlines[0].evidence).toContain("初回提出期限");
  expect(r.pageUrl).not.toContain("SECRET");
});
it("i-web produces three unresolved dates without inventing calendar year", () => {
  const r = parsePage({
    text: "未来設計ラボNEXT\nWEB:\n10/3\n10/17\n10/31",
    title: "イベント予約",
    url: "https://mypage.3030.i-webs.jp/",
  });
  expect(r.events).toHaveLength(3);
  expect(r.events.every((x) => x.date === null)).toBe(true);
  expect(r.parserProvider).toBe("iweb");
});
it("uses explicit hosting year but never graduation year as calendar year", () => {
  const base = { title: "イベント", url: "" };
  expect(
    parsePage({ ...base, text: "2028卒\n説明会 10/3" }).events[0].date,
  ).toBeNull();
  expect(
    parsePage({ ...base, text: "2026年開催\n説明会 10/3" }).events[0].date,
  ).toBe("2026-10-03");
});
it("separates mixed graduation cohorts by refusing combined import", () => {
  expect(
    parsePage({
      title: "採用",
      url: "",
      text: "2027卒\nES締切2026/9/28\n2028卒\nES締切2027/9/28",
    }).deadlines,
  ).toHaveLength(0);
});
it("Japanese noon, AM/PM and leap validation", () => {
  expect(extractDates("2026年10月5日 正午")[0].value).toBe(
    "2026-10-05T12:00:00+09:00",
  );
  expect(extractDates("2026/10/5 午後2時")[0].value).toContain("T14:00");
  expect(extractDates("2026/10/5 午前10時")[0].value).toContain("T10:00");
  expect(extractDates("2026/2/30")).toHaveLength(0);
});
it("extracts explicit flow only and event end time", () => {
  const r = parsePage({
    title: "PHC",
    url: "",
    text: "選考フロー\nES → Webテスト → 一次面接 → 最終面接\nAI事業開発イベント\n2026/10/5 14:00-15:30",
  });
  expect(r.detectedSelectionSteps.map((x) => x.type)).toEqual([
    "ES_DEADLINE",
    "WEB_TEST",
    "INTERVIEW",
    "FINAL_INTERVIEW",
  ]);
  expect(r.events[0]).toMatchObject({
    date: "2026-10-05T14:00:00+09:00",
    end: "2026-10-05T15:30:00+09:00",
  });
  expect(
    parsePage({ text: "面接の対策とESの注意", title: "採用", url: "" })
      .detectedSelectionSteps,
  ).toHaveLength(0);
});
it("removes secrets, contact details and unsafe URL components", () => {
  const value = cleanText(
    "氏名: 山田太郎\nパスワード: secret\nCSRF: token\nメールアドレス: test@example.com\n連絡 test@example.com 090-1234-5678\nES回答: 私は素晴らしい\nES締切2026/9/28",
  );
  expect(value).not.toMatch(/山田|secret|token|test@example|090-|素晴らしい/);
  expect(value).toContain("ES締切");
  expect(
    cleanSourceUrl("https://example.com/page?csrf=secret#access_token=x"),
  ).toBe("https://example.com/page");
  expect(cleanSourceUrl("javascript:alert(1)")).toBe("");
});
it("strict extraction rejects raw DOM/cookies and re-sanitizes fields", () => {
  const r = parsePage({ text: snar, title: "MIXI", url: "" });
  expect(() => sanitizeExtraction({ ...r, cookies: "secret" })).toThrow();
  expect(sanitizeExtraction({ ...r, pageTitle: "氏名: 山田" }).pageTitle).toBe(
    "",
  );
});
it("planner fits a time budget, excludes completed tasks, and favors urgent/S", () => {
  const app = { id: "a", priority: "S", status: "選考中" } as Application;
  const tasks = [
    {
      id: "one",
      user_application_id: "a",
      title: "ES提出",
      task_type: "ES",
      due_date: "2026-09-28",
      estimated_minutes: 60,
      completed: false,
    },
    {
      id: "two",
      title: "応募",
      user_application_id: "a",
      task_type: "応募",
      due_date: null,
      estimated_minutes: 15,
      completed: false,
    },
    { id: "done", title: "完了", completed: true, estimated_minutes: 10 },
  ] as Task[];
  const plan = planToday(
    tasks,
    [app],
    70,
    new Date("2026-09-27T10:00:00+09:00"),
  );
  expect(plan.selected.map((x) => x.task.id)).toEqual(["one"]);
  expect(plan.used).toBe(60);
  expect(plan.deferred).toHaveLength(1);
  expect(plan.selected[0].score).toBe(175);
});
it("profile matches aliases without inventing experience", () => {
  expect(
    matchProfile(
      {
        skills: ["AI", "Python", "英語"],
        experiences: [],
        interests: ["事業開発"],
      },
      ["AI", "English", "BizDev"],
    ),
  ).toEqual(["AI", "英語", "事業開発"]);
});
describe("optional Gmail", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is disabled without credentials", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(gmailConfigured()).toBe(false);
  });
  it("encrypts refresh tokens and detects tampering", () => {
    vi.stubEnv(
      "GMAIL_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    const encrypted = encryptToken("my-refresh-token");
    expect(encrypted).not.toContain("my-refresh-token");
    expect(decryptToken(encrypted)).toBe("my-refresh-token");
    expect(() => decryptToken(encrypted.slice(0, -4) + "AAAA")).toThrow();
  });
  it("does not download attachments or return HTML form inputs", () => {
    const r = mailText({
      mimeType: "text/html",
      body: {
        data: Buffer.from(
          '<input value="PASSWORD"><p>ES締切2026/9/28</p>',
        ).toString("base64url"),
      },
    });
    expect(r).not.toContain("PASSWORD");
    expect(r).toContain("ES締切");
    expect(mailText({ mimeType: "application/pdf", body: { data: "a" } })).toBe(
      "",
    );
  });
});

it("optional Gemini never receives user IDs or essay fields, and rejects invented dates", async () => {
  const base = parsePage({ text: snar, title: "MIXI", url: "" });
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(await refineImport(base)).toEqual(base);
  expect(Object.keys(importAIInput(base))).not.toContain("user_id");
  const provider = {
    refine: vi.fn(async () => ({
      ...base,
      events: [
        { ...base.deadlines[0], date: "2030-01-01", evidence: "made up" },
      ],
    })),
  };
  expect(await refineImport(base, provider)).toEqual(base);
  expect(provider.refine).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
import { exportCsvFiles, parseCsvFiles } from "../src/lib/csv";
import { eventsFromStore } from "../src/lib/dates";
import { demoData } from "../src/lib/demo";
it("v2 CSV retains exact task times, estimates and imported calendar events", () => {
  const store = demoData("a"),
    app = store.applications[0];
  store.tasks[0].due_value = "2026-09-28T23:59:00+09:00";
  store.tasks[0].estimated_minutes = 60;
  store.tasks[0].calendar_enabled = false;
  store.importedEvents = [
    {
      id: "event",
      user_id: "a",
      user_application_id: app.id,
      title: "説明会",
      event_type: "説明会",
      start_value: "2026-10-03",
      end_value: "2026-10-05",
      completed: false,
      import_key: "x",
      field_provenance: {},
    },
  ];
  const restored = parseCsvFiles(exportCsvFiles(store), "b");
  expect(restored.tasks[0]).toMatchObject({
    due_value: "2026-09-28T23:59:00+09:00",
    estimated_minutes: 60,
    calendar_enabled: false,
  });
  expect(restored.importedEvents?.[0]).toMatchObject({
    start_value: "2026-10-03",
    end_value: "2026-10-05",
  });
  expect(
    eventsFromStore({ ...store, ...restored }).find(
      (e) => e.title.includes("説明会") && e.start === "2026-10-03",
    )?.end,
  ).toBe("2026-10-06");
});
it("does not parse indented ES answers containing date-like text", () => {
  const r = parsePage({
    url: "",
    title: "採用",
    text: "  回答内容\n 私の経験は\nイベントを2026/9/28に開催した。\nお知らせ\nES締切 2026/10/5",
  });
  expect(r.events).toHaveLength(0);
  expect(r.deadlines[0]).toMatchObject({ date: "2026-10-05", title: "ES締切" });
});
it("keeps SNAR response deadlines while excluding response text", () => {
  const r = parsePage({
    text: "回答期限 2026/9/28 23:59",
    title: "採用",
    url: "https://mixi-recruit.snar.jp/",
  });
  expect(r.deadlines[0].date).toBe("2026-09-28T23:59:00+09:00");
});
