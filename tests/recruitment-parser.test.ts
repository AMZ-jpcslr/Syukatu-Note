import { it, expect, vi } from "vitest";
import {
  cleanRecruitmentHtml,
  contentHash,
} from "../src/services/recruitment-html";
import {
  graduationYears,
  extractDates,
  contextCalendarYear,
  parseRecruitmentPage,
} from "../src/services/recruitment-rule-parser";
import {
  withOptionalAI,
  publicParserInput,
  validateAIResult,
} from "../src/services/recruitment-ai-parser";
import {
  analyzeChangedPages,
  combinedHash,
  priorityInterval,
} from "../src/services/recruitment-monitor";
import {
  createRecruitmentDiff,
  matchTemplate,
  isImportantUpdate,
} from "../src/services/recruitment-diff";
import {
  isPublicAddress,
  validateFetchUrl,
  resolvePublicUrl,
  crawlRecruitmentPages,
} from "../src/services/recruitment-fetcher";
import { demoData, demoTemplates } from "../src/lib/demo";
import { eventsFromStore } from "../src/lib/dates";
import { exportCsvFiles, parseCsvFiles } from "../src/lib/csv";
const page = (html: string) =>
  cleanRecruitmentHtml(
    "<title>株式会社テスト 新卒採用</title><main>" + html + "</main>",
    "https://careers.example.com/2028",
  );
const sample = () =>
  page(
    "<h1>2028卒 Software Engineer 本選考</h1><p>応募開始：2026年10月1日</p><p>応募締切：2026年10月16日 正午</p><h2>選考フロー</h2><p>エントリー → ES → Webテスト → 一次面接 → 最終面接</p><h2>日程</h2><p>ES締切：2026年10月10日</p><p>Webテスト締切：2026年10月12日 17:00</p><p>一次面接日：2026年10月14日 14:00</p>",
  );
it("detects cohorts without converting 2027 to 2028", () => {
  for (const t of [
    "28卒",
    "2028卒",
    "2028年卒",
    "2028年度入社",
    "2028年4月入社",
    "Class of 2028",
  ])
    expect(graduationYears(t)).toEqual([2028]);
  expect(graduationYears("27卒 29卒")).toEqual([2027, 2029]);
});
it("preserves date-only and explicit noon; never infers a calendar year from cohort", () => {
  expect(extractDates("2026年10月5日")[0].value).toBe("2026-10-05");
  expect(extractDates("10月5日 正午", 2026)[0].value).toBe(
    "2026-10-05T12:00:00+09:00",
  );
  expect(contextCalendarYear("2028卒 10/5")).toBeNull();
  expect(extractDates("10/5")).toEqual([]);
  expect(extractDates("2026/02/30")).toEqual([]);
  expect(extractDates("2026/10/05 23:59")[0].value).toBe(
    "2026-10-05T23:59:00+09:00",
  );
});
it("removes noise while retaining tables inside no-sidebar layouts", () => {
  const p = cleanRecruitmentHtml(
    '<title>採用</title><nav>noise</nav><div class="no-sidebar"><main><h1>2028卒</h1><table><tr><th>応募締切</th><td>2026/10/16</td></tr></table></main></div><script>secret()</script><footer>footer</footer>',
    "https://example.com",
  );
  expect(p.text).toContain("2026/10/16");
  expect(p.text).not.toMatch(/noise|secret|footer/);
});
it("extracts application dates and separate ES/test/interview steps with evidence", () => {
  const r = parseRecruitmentPage(sample(), { official: true }).recruitments[0];
  expect(r.graduation_year).toBe(2028);
  expect(r.application_start).toBe("2026-10-01");
  expect(r.application_deadline).toBe("2026-10-16T12:00:00+09:00");
  expect(r.selection_steps.map((s) => s.type)).toEqual([
    "ENTRY",
    "ES",
    "WEB_TEST",
    "INTERVIEW",
    "FINAL_INTERVIEW",
  ]);
  expect(r.selection_steps.find((s) => s.type === "ES")?.deadline).toBe(
    "2026-10-10",
  );
  expect(r.selection_steps.find((s) => s.type === "WEB_TEST")?.deadline).toBe(
    "2026-10-12T17:00:00+09:00",
  );
  expect(r.confidence).toBe(1);
  expect(r.evidence.application_deadline.evidence_text).toContain("正午");
});
it("keeps unknown deadlines null and capacity / MyPage notes", () => {
  const r = parseRecruitmentPage(
    page(
      "<h1>28卒 Business 本選考</h1><p>エントリー受付中</p><p>定員に達し次第終了</p><p>詳細はMyPage</p>",
    ),
  ).recruitments[0];
  expect(r.application_deadline).toBeNull();
  expect(r.deadline_type).toBe("capacity");
  expect(r.application_status).toBe("open");
  expect(r.warnings.join()).toContain("MyPage");
});
it("separates job and year sections", () => {
  const r = parseRecruitmentPage(
    page(
      "<h1>2028卒</h1><h2>Software Engineer 本選考</h2><p>応募締切 2026/10/10</p><h2>Business 本選考</h2><p>応募締切 2026/11/10</p><h1>2027卒</h1><h2>Software Engineer 本選考</h2><p>応募締切 2025/10/10</p>",
    ),
  ).recruitments;
  expect(r).toHaveLength(3);
  expect(r.map((x) => [x.graduation_year, x.application_deadline])).toEqual([
    [2028, "2026-10-10"],
    [2028, "2026-11-10"],
    [2027, "2025-10-10"],
  ]);
});
it("does not map ambiguous multiple deadlines to one recruitment", () => {
  const r = parseRecruitmentPage(
    page("<h1>28卒 本選考</h1><p>締切 2026/10/1、2026/11/1</p>"),
  ).recruitments[0];
  expect(r.application_deadline).toBeNull();
});
it("skips Gemini without key, for high confidence and for other cohorts", async () => {
  const provider = { parse: vi.fn() },
    p = sample(),
    rule = parseRecruitmentPage(p, { official: true });
  await withOptionalAI(p, rule, { enabled: true, key: "", provider });
  await withOptionalAI(p, rule, { enabled: true, key: "test", provider });
  const old = page("<h1>2027卒 新卒採用</h1>");
  await withOptionalAI(old, parseRecruitmentPage(old), {
    enabled: true,
    key: "test",
    provider,
  });
  expect(provider.parse).not.toHaveBeenCalled();
});
it("uses optional fallback only at low confidence and survives API failure", async () => {
  const p = page("<h1>28卒 新卒採用</h1>"),
    r = parseRecruitmentPage(p);
  const provider = { parse: vi.fn().mockResolvedValue(r) };
  expect(
    (await withOptionalAI(p, r, { enabled: true, key: "test", provider }))
      .aiCalled,
  ).toBe(true);
  provider.parse.mockRejectedValue(new Error("fail"));
  expect(
    (await withOptionalAI(p, r, { enabled: true, key: "test", provider }))
      .result,
  ).toBe(r);
});
it("AI input allowlist excludes private data and rejects invented dates", () => {
  const p = sample();
  expect(
    JSON.stringify(
      publicParserInput({
        ...p,
        memo: "PRIVATE",
        user_id: "SECRET",
        transfer_code: "SECRET",
      } as typeof p),
    ),
  ).not.toMatch(/PRIVATE|SECRET/);
  const r = parseRecruitmentPage(p);
  r.recruitments[0].application_deadline = "2029-01-01";
  expect(
    validateAIResult(r, p).recruitments[0].application_deadline,
  ).toBeNull();
});
it("unchanged content skips rules, Gemini and candidate generation", async () => {
  const p = sample();
  const result = await analyzeChangedPages([p], combinedHash([p]), {
    companyId: null,
    companyName: "Test",
    official: true,
    templates: [],
    aiEnabled: true,
  });
  expect(result).toMatchObject({
    unchanged: true,
    ruleCount: 0,
    aiCount: 0,
    candidates: [],
  });
  expect(contentHash(" a  b ")).toBe(contentHash("a b"));
});
it("diffs new facts, keeps missing dates out, separates years and marks deadline changes", () => {
  const r = parseRecruitmentPage(sample()).recruitments[0],
    t = {
      ...demoTemplates()[0],
      graduation_year: 2028,
      position_name: r.position_name!,
      job_category: r.job_category!,
      selection_type: r.selection_type,
    };
  expect(matchTemplate(t.company_id, r, [t])?.id).toBe(t.id);
  expect(
    matchTemplate(t.company_id, { ...r, graduation_year: 2027 }, [t]),
  ).toBeNull();
  const diff = createRecruitmentDiff(r, t);
  expect(isImportantUpdate(r, diff)).toBe(true);
  expect(
    createRecruitmentDiff({ ...r, application_deadline: null }, t)
      .application_deadline,
  ).toBeUndefined();
});
it("blocks local/private/mapped/metadata targets including DNS resolution", async () => {
  for (const ip of [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "10.1.1.1",
    "172.31.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
  ])
    expect(isPublicAddress(ip)).toBe(false);
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "http://localhost",
    "http://2130706433",
    "https://user:pass@example.com",
  ])
    expect(() => validateFetchUrl(url)).toThrow();
  await expect(
    resolvePublicUrl(
      "https://example.com",
      vi.fn().mockResolvedValue([{ address: "10.0.0.1", family: 4 }]),
    ),
  ).rejects.toThrow("ssrf_blocked");
});
it("respects robots, rejects redirects to private targets and bounds crawl", async () => {
  const fetcher = vi.fn(async (url: string) => ({
    url,
    status: 200,
    headers: { "content-type": "text/html" },
    body: url.endsWith("robots.txt")
      ? "User-agent: *\nDisallow: /blocked"
      : '<title>採用</title><main><a href="/next">2028採用</a></main>',
  }));
  const denied = await crawlRecruitmentPages(["https://example.com/blocked"], {
    fetcher,
    delayMs: 0,
  });
  expect(denied.errors[0].code).toBe("robots_denied");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const redirected = await crawlRecruitmentPages(["https://example.com"], {
    delayMs: 0,
    fetcher: async (url) => ({
      url,
      status: url.endsWith("robots.txt") ? 404 : 302,
      headers: { location: "http://127.0.0.1" },
      body: "",
    }),
  });
  expect(redirected.errors[0].code).toBe("ssrf_blocked");
  const crawled = await crawlRecruitmentPages(["https://example.com"], {
    fetcher,
    delayMs: 0,
    maxPages: 1,
  });
  expect(crawled.pages).toHaveLength(1);
  expect(priorityInterval("medium")).toBe(3.5 * 86400000);
});
it("projects approved precise dates once, obeys opt-out and preserves CSV precision", () => {
  const store = demoData("a"),
    a = store.applications[0];
  a.application_deadline_value = "2026-10-16T12:00:00+09:00";
  a.event_start = "2026-10-01";
  a.event_end = "2026-10-03";
  const event = eventsFromStore(store).find((e) => e.id === a.id + "-close");
  expect(event?.allDay).toBe(false);
  expect(
    eventsFromStore(store).find((e) => e.id === a.id + "-event")?.end,
  ).toBe("2026-10-04");
  a.calendar_exclusions = ["application_deadline"];
  expect(eventsFromStore(store).some((e) => e.id === a.id + "-close")).toBe(
    false,
  );
  const restored = parseCsvFiles(exportCsvFiles(store), "b");
  expect(restored.applications[0].application_deadline_value).toBe(
    a.application_deadline_value,
  );
});

it("never applies a previous cohort's inline deadline to 2028", () => {
  const p = page(
    "<h1>2028卒 Software Engineer 本選考</h1><p>応募開始：2026年10月1日</p><p>2027卒の締切：2025年10月15日</p>",
  );
  const results = parseRecruitmentPage(p).recruitments;
  expect(
    results.find((r) => r.graduation_year === 2028)?.application_deadline,
  ).toBeNull();
  expect(
    results.find((r) => r.graduation_year === 2027)?.application_deadline,
  ).toBe("2025-10-15");
});
it("does not erase a capacity deadline when a page has no date, or mistake Business for ES", () => {
  const r = parseRecruitmentPage(
    page("<h1>2028卒 Business 本選考</h1><p>Business 応募締切 2026/10/15</p>"),
  ).recruitments[0];
  expect(r.application_deadline).toBe("2026-10-15");
  const unknown = { ...r, application_deadline: null, evidence: {} };
  expect(
    createRecruitmentDiff(unknown, {
      ...demoTemplates()[0],
      deadline_type: "capacity",
    }).deadline_type,
  ).toBeUndefined();
});
