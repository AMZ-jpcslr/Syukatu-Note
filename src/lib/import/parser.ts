import { isValid, parseISO } from "date-fns";
import {
  contextCalendarYear,
  extractDates,
  graduationYears,
  detectJob,
  detectSelection,
  extractFlow,
} from "../../services/recruitment-rule-parser";
import {
  pageExtractionSchema,
  itemEventType,
  type ImportItem,
  type PageExtractionResult,
} from "./schema";
import {
  cleanSourceUrl,
  cleanText,
  sanitizedLines,
  shortEvidence,
  scheduleWords,
} from "./sanitize";
export function providerFor(
  url: string,
): PageExtractionResult["parserProvider"] {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (/(^|\.)snar\.jp$/.test(host)) return "snar";
  if (/(^|\.)i-webs?\.(jp|co\.jp)$/.test(host)) return "iweb";
  if (/(^|\.)hrmos\.co$/.test(host)) return "hrmos";
  if (/recruit|mypage/.test(host)) return "recruiting-platform";
  return "generic";
}
export function itemKind(text: string): ImportItem["type"] {
  if (/最終面接|最終選考/.test(text)) return "FINAL_INTERVIEW";
  if (/エントリーシート|\bES\b/i.test(text)) return "ES_DEADLINE";
  if (/web.?テスト|適性検査|SPI|玉手箱/i.test(text)) return "WEB_TEST";
  if (/コーディング|技術課題|coding/i.test(text)) return "CODING_TEST";
  if (/面接|面談/.test(text)) return "INTERVIEW";
  if (/グループディスカッション|\bGD\b/i.test(text)) return "GD";
  if (/インターン|仕事体験|intern|workshop/i.test(text)) return "INTERNSHIP";
  if (/説明会|イベント|ラボ|予約|セミナー/.test(text)) return "SESSION";
  if (/締切|期限/.test(text)) return "APPLICATION_DEADLINE";
  if (/エントリー|応募/.test(text)) return "ENTRY";
  return "OTHER";
}
export function parsePage(input: {
  text: string;
  title: string;
  url: string;
  companyName?: string;
}): PageExtractionResult {
  const pageUrl = cleanSourceUrl(input.url),
    pageTitle = cleanText(input.title).slice(0, 180);
  const lines = sanitizedLines(input.text),
    text = lines.join("\n");
  const cohorts = graduationYears(text + "\n" + pageTitle),
    contextYear = contextCalendarYear(text);
  const companyName =
    cleanText(input.companyName ?? "").slice(0, 120) ||
    (/mixi-recruit\.snar\.jp/.test(pageUrl)
      ? "MIXI"
      : (pageTitle.match(/【([^】]{1,80})】/)?.[1] ??
        pageTitle.match(
          /^(.{1,80}?)\s*[|｜]\s*(?:採用|新卒|MyPage|マイページ)/i,
        )?.[1] ??
        null));
  const result: PageExtractionResult = {
    companyName,
    pageUrl,
    pageTitle,
    graduationYear: cohorts.length === 1 ? cohorts[0] : null,
    recruitmentName: null,
    positionName: detectJob(pageTitle + "\n" + text.slice(0, 1000)),
    recruitmentType: detectSelection(pageTitle + "\n" + text.slice(0, 1000)),
    deadlines: [],
    events: [],
    detectedSelectionSteps: [],
    parserProvider: providerFor(pageUrl),
    confidence: 0,
    warnings: [],
    detectedStatus:
      text.match(
        /不合格|合格|提出済|回答済|選考中|辞退|応募受付中|予約受付中/,
      )?.[0] ?? null,
  };
  if (cohorts.length > 1)
    result.warnings.push(
      "複数の卒年度が混在しています。募集ごとにテキストを選択し直してください。",
    );
  if (!cohorts.length)
    result.warnings.push(
      "卒年度は記載を確認できませんでした。承認時に確認してください。",
    );
  // Mixed cohorts are never automatically combined into a single application.
  if (cohorts.length > 1) return pageExtractionSchema.parse(result);
  let heading = "",
    flowMode = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (
      /(?:選考フロー|選考プロセス|選考ステップ|Selection Process)/i.test(line)
    ) {
      flowMode = true;
      heading = line;
      continue;
    }
    if (
      flowMode &&
      !/→|↓|STEP|ES|応募|テスト|面接|内定|エントリー|GD|選考/i.test(line)
    )
      flowMode = false;
    if (
      flowMode ||
      /(?:ES|エントリーシート|面接|Webテスト).*?(?:→|↓)/i.test(line)
    ) {
      const flow = extractFlow(line, {
        source_url: pageUrl,
        source_page_title: pageTitle,
        evidence_text: shortEvidence(line),
      });
      for (const step of flow)
        result.detectedSelectionSteps.push({
          key: "flow-" + result.detectedSelectionSteps.length,
          type: itemKind(step.title),
          title: step.title,
          date: null,
          end: null,
          dateLabel: "",
          evidence: shortEvidence(line),
          order: result.detectedSelectionSteps.length,
        });
    }
    const before = lines[index - 1] ?? "",
      after = lines[index + 1] ?? "";
    const hasDate = /\d{1,2}\s*[月/]\s*\d{1,2}|20\d{2}-\d{2}-\d{2}/.test(line);
    if (
      !hasDate &&
      scheduleWords.test(line) &&
      line.length < 140 &&
      !/^WEB[:：]?$/i.test(line)
    )
      heading = line;
    if (!hasDate) continue;
    const context = scheduleWords.test(line) ? line : `${heading}\n${line}`;
    if (!scheduleWords.test(context)) continue;
    const localYear = contextCalendarYear(line) ?? contextYear;
    const dates = extractDates(line, localYear);
    const rawDates = [
      ...line.matchAll(/(?<!\d)(?:(?:20\d{2})[年/-])?\d{1,2}[月/-]\d{1,2}日?/g),
    ];
    const candidates = dates.length
      ? dates.map((d) => ({ value: d.value, raw: d.raw }))
      : rawDates.map((d) => ({ value: null, raw: d[0] }));
    const type = itemKind(context),
      isDeadline = /締切|期限|まで/.test(context);
    const evidence = shortEvidence(context || before + line + after);
    for (let n = 0; n < candidates.length; n++) {
      const d = candidates[n];
      if (d.value && !isValid(parseISO(d.value))) continue;
      let end: string | null = null;
      const endTime = line.match(/(?:〜|～|~|–|－|-)\s*(\d{1,2}):(\d{2})/);
      if (
        d.value?.includes("T") &&
        endTime &&
        +endTime[1] < 24 &&
        +endTime[2] < 60
      ) {
        end =
          d.value.slice(0, 10) +
          "T" +
          endTime[1].padStart(2, "0") +
          ":" +
          endTime[2] +
          ":00+09:00";
        if (end < d.value) end = null;
      }
      const title =
        (heading && !/選考フロー/.test(heading)
          ? heading
          : context.split("\n")[0]
        )
          .replace(/【.*?】/g, "")
          .slice(0, 120)
          .trim() || type;
      const item: ImportItem = {
        key: `${isDeadline ? "deadline" : "event"}-${result.deadlines.length + result.events.length}`,
        type,
        title: isDeadline
          ? type === "CODING_TEST"
            ? "技術課題締切"
            : itemEventType[type] +
              (itemEventType[type].includes("締切") ? "" : " 期限")
          : title,
        date: d.value,
        end,
        dateLabel: d.raw,
        evidence,
        order: null,
      };
      const target = isDeadline ? result.deadlines : result.events;
      if (
        !target.some(
          (i) =>
            i.type === type &&
            i.date === item.date &&
            i.dateLabel === item.dateLabel,
        )
      )
        target.push(item);
      if (
        !d.value &&
        !result.warnings.includes(
          "年を確認できない日程は未設定です。年を推測せず、承認前に確認してください。",
        )
      )
        result.warnings.push(
          "年を確認できない日程は未設定です。年を推測せず、承認前に確認してください。",
        );
    }
  }
  result.recruitmentName = result.positionName
    ? `${result.graduationYear ? result.graduationYear + "卒 " : ""}${result.positionName}`
    : null;
  if (!result.deadlines.length)
    result.warnings.push("締切日の記載を確認できませんでした。");
  result.confidence = Math.min(
    1,
    (result.graduationYear ? 0.2 : 0) +
      (result.positionName ? 0.1 : 0) +
      (result.recruitmentType !== "未発表" ? 0.15 : 0) +
      (result.deadlines.some((d) => d.date) ? 0.2 : 0) +
      (result.events.some((e) => e.date) ? 0.1 : 0) +
      (result.detectedSelectionSteps.length ? 0.15 : 0),
  );
  return pageExtractionSchema.parse({
    ...result,
    deadlines: result.deadlines.slice(0, 30),
    events: result.events.slice(0, 30),
    detectedSelectionSteps: result.detectedSelectionSteps.slice(0, 30),
  });
}
export function sanitizeExtraction(input: unknown): PageExtractionResult {
  const parsed = pageExtractionSchema.parse(input);
  const string = (s: string | null, max: number) =>
    s === null ? null : cleanText(s).slice(0, max);
  const items = (list: ImportItem[]) =>
    list.map((i) => ({
      ...i,
      title: string(i.title, 160) || "予定",
      evidence: shortEvidence(i.evidence),
      dateLabel: string(i.dateLabel, 80) || "",
    }));
  return pageExtractionSchema.parse({
    ...parsed,
    companyName: string(parsed.companyName, 120),
    pageTitle: string(parsed.pageTitle, 180),
    recruitmentName: string(parsed.recruitmentName, 160),
    positionName: string(parsed.positionName, 120),
    pageUrl: cleanSourceUrl(parsed.pageUrl),
    deadlines: items(parsed.deadlines),
    events: items(parsed.events),
    detectedSelectionSteps: items(parsed.detectedSelectionSteps),
    warnings: parsed.warnings.map((s) => cleanText(s, 160)),
    detectedStatus: string(parsed.detectedStatus, 30),
  });
}
