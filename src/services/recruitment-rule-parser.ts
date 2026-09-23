import type {
  RecruitmentPage,
  Recruitment,
  RecruitmentParseResult,
  ParsedStep,
  Evidence,
} from "../lib/recruitment";
import { parseResultSchema } from "../lib/recruitment";
export function graduationYears(text: string): number[] {
  const normalized = text.normalize("NFKC"),
    years = new Set<number>();
  for (const m of normalized.matchAll(
    /(?<!\d)(20\d{2}|\d{2})\s*(?:年\s*)?(?:卒|年度入社|年?4月入社)|Class\s+of\s+(20\d{2})/gi,
  )) {
    const n = Number(m[1] ?? m[2]);
    years.add(n < 100 ? 2000 + n : n);
  }
  return [...years];
}
const cohortPattern =
  /(?:20\d{2}|\d{2})\s*(?:年\s*)?(?:卒|年度入社|年?4月入社)|Class\s+of\s+20\d{2}/gi;
export function contextCalendarYear(text: string): number | null {
  const withoutCohort = text.replace(cohortPattern, "");
  const years = new Set<number>();
  for (const m of withoutCohort.matchAll(/(20\d{2})\s*(?:年|[\/-])/g))
    years.add(Number(m[1]));
  return years.size === 1 ? [...years][0] : null;
}
export function extractDates(text: string, contextYear: number | null = null) {
  const values: { value: string; raw: string; index: number }[] = [];
  const re =
    /(?<!\d)(?:(20\d{2})\s*(?:年|[\/-])\s*)?(\d{1,2})\s*(?:月|[\/-])\s*(\d{1,2})\s*日?(?:\s*[（(][月火水木金土日](?:曜(?:日)?)?[）)])?(?:\s*(正午|午前\s*\d{1,2}(?:時(?:(?:\d{1,2})分)?|:\d{2})?|午後\s*\d{1,2}(?:時(?:(?:\d{1,2})分)?|:\d{2})?|\d{1,2}:\d{2}|\d{1,2}時(?:\d{1,2}分)?))?/g;
  for (const m of text.normalize("NFKC").matchAll(re)) {
    const year = m[1] ? Number(m[1]) : contextYear;
    if (!year) continue;
    const month = Number(m[2]),
      day = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    )
      continue;
    let value =
      String(year) +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0");
    if (m[4]) {
      let hour = 0,
        minute = 0;
      const time = m[4];
      if (time === "正午") hour = 12;
      else {
        const t = time.match(/(\d{1,2})(?:時|:)?(?:(\d{1,2})分?)?/);
        if (!t) continue;
        hour = Number(t[1]);
        minute = Number(t[2] ?? 0);
        if (time.startsWith("午後") && hour < 12) hour += 12;
        if (time.startsWith("午前") && hour === 12) hour = 0;
      }
      if (hour > 23 || minute > 59) continue;
      value +=
        "T" +
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0") +
        ":00+09:00";
    }
    values.push({ value, raw: m[0].trim(), index: m.index! });
  }
  return values;
}
const jobs: [string, RegExp][] = [
  ["Product Manager", /Product Manager|\bPdM\b/i],
  ["Product Planner", /Product Planner/i],
  ["Business Development", /Business Development|\bBizDev\b|新規事業/i],
  ["事業企画", /事業企画/],
  ["ML Engineer", /ML Engineer|機械学習エンジニア/i],
  ["AI Engineer", /AI Engineer|AIエンジニア/i],
  [
    "Software Engineer",
    /Software Engineer|\bSWE\b|ソフトウェアエンジニア|エンジニア職/i,
  ],
  ["Data Scientist", /Data Scientist|データサイエンティスト/i],
  ["Marketing", /Marketing|マーケティング/i],
  ["Sales", /\bSales\b|営業職/i],
  ["Consultant", /Consultant|コンサルタント/i],
  ["Security", /Security|セキュリティ/i],
  ["Research", /Research|研究職/i],
  ["DX", /\bDX\b/i],
  ["Digital", /\bDigital\b|デジタル/i],
  ["Generalist", /Generalist|総合職/i],
  ["Business", /\bBusiness\b|ビジネス職/i],
];
export const detectJob = (text: string) =>
  jobs.find(([, re]) => re.test(text))?.[0] ?? null;
export function detectSelection(text: string): Recruitment["selection_type"] {
  if (/採用直結|内定直結|本選考直結|選考直結|fast track/i.test(text))
    return "採用直結インターン";
  if (/選考優遇|一部選考免除|特別選考|early route/i.test(text))
    return "選考優遇インターン";
  if (/早期選考|early selection|early entry/i.test(text)) return "早期選考";
  if (/internship|インターン/i.test(text)) return "インターン";
  if (/ワークショップ|workshop/i.test(text)) return "ワークショップ";
  if (/company session|説明会|seminar/i.test(text)) return "説明会";
  if (/本選考|新卒採用|\bselection\b/i.test(text)) return "本選考";
  return "未発表";
}
const steps: [ParsedStep["type"], RegExp][] = [
  ["FINAL_INTERVIEW", /最終面接|最終選考|final interview/gi],
  [
    "CODING_TEST",
    /コーディングテスト|coding test|技術課題|\bTrack\b|HackerRank/gi,
  ],
  ["WEB_TEST", /Webテスト|適性検査|\bSPI\b|玉手箱|TG-WEB|\bCAB\b|\bGAB\b/gi],
  ["ES", /エントリーシート|Entry Sheet|\bES\b/gi],
  ["GD", /グループディスカッション|group discussion|\bGD\b/gi],
  ["INTERVIEW", /[一二三]次面接|面接|面談|interview/gi],
  ["ENTRY", /エントリー|応募|entry/gi],
  ["INTERNSHIP", /インターン(?:シップ)?|Internship|\bJob\b|Workshop/gi],
  ["OFFER", /内々定|内定|\boffer\b/gi],
];
export function extractFlow(text: string, evidence: Evidence): ParsedStep[] {
  const matches: {
    index: number;
    end: number;
    title: string;
    type: ParsedStep["type"];
  }[] = [];
  for (const [type, re] of steps)
    for (const m of text.matchAll(re)) {
      if (matches.some((s) => m.index! >= s.index && m.index! < s.end))
        continue;
      matches.push({
        index: m.index!,
        end: m.index! + m[0].length,
        title: m[0],
        type,
      });
    }
  return matches
    .sort((a, b) => a.index - b.index)
    .slice(0, 30)
    .map((s, i) => ({
      title: s.title,
      type: s.type,
      deadline: null,
      scheduled_at: null,
      order_index: i,
      evidence,
    }));
}
const flowHeading =
  /選考フロー|選考プロセス|選考ステップ|応募から内定まで|Selection Process|^Flow$/i;
function parseBlock(
  page: RecruitmentPage,
  heading: string,
  text: string,
  year: number | null,
  company: string | null,
  official: boolean,
  flowText: string,
): Recruitment {
  const quote = (value: string): Evidence => ({
    source_url: page.url,
    source_page_title: page.title,
    evidence_text: value.trim().slice(0, 1600),
  });
  const r: Recruitment = {
    company_name: company,
    graduation_year: year,
    position_name: heading.slice(0, 160) || null,
    job_category: detectJob(heading),
    selection_type: detectSelection(heading + "\n" + text),
    application_status: "unknown",
    deadline_type: "date",
    application_start: null,
    application_deadline: null,
    event_start: null,
    event_end: null,
    source_url: page.url,
    selection_steps: flowText ? extractFlow(flowText, quote(flowText)) : [],
    eligibility: null,
    notes: null,
    confidence: 0,
    warnings: [],
    evidence: { source_url: quote(heading) },
  };
  if (year)
    r.evidence.graduation_year = quote(
      [
        page.title,
        heading,
        ...text.split("\n").filter((l) => graduationYears(l).includes(year)),
      ].join("\n"),
    );
  r.evidence.position_name = quote(heading);
  if (r.job_category) r.evidence.job_category = quote(heading);
  if (r.selection_type !== "未発表")
    r.evidence.selection_type = quote(
      text.split("\n").find((l) => detectSelection(l) === r.selection_type) ??
        heading,
    );
  if (flowText) r.evidence.selection_steps = quote(flowText);
  const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    calendarYear = contextCalendarYear(heading + "\n" + text);
  const found = new Map<string, { value: string; evidence: Evidence }[]>();
  const add = (field: string, value: string, evidence: Evidence) => {
    const list = found.get(field) ?? [];
    if (!list.some((v) => v.value === value)) list.push({ value, evidence });
    found.set(field, list);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      snippet =
        !extractDates(line, calendarYear).length &&
        lines[i + 1] &&
        /^\s*(?:20\d{2}[年/-])?\d{1,2}[月/]/.test(lines[i + 1])
          ? line + " " + lines[i + 1]
          : line;
    const e = quote(snippet),
      dates = extractDates(snippet, calendarYear);
    if (
      /定員.*(?:達し|到達)|定員到達次第|定員に達する|募集人数に達し/i.test(
        snippet,
      )
    ) {
      r.deadline_type = "capacity";
      r.evidence.deadline_type = e;
    }
    if (
      /受付終了|募集終了|エントリー.*終了しました|応募.*締め切|募集を終了/i.test(
        snippet,
      )
    ) {
      r.application_status = "closed";
      r.evidence.application_status = e;
    } else if (
      r.application_status !== "closed" &&
      /公開予定|募集予定|(?:募集|受付|応募).*開始予定/.test(snippet)
    ) {
      r.application_status = "upcoming";
      r.evidence.application_status = e;
    } else if (
      r.application_status !== "closed" &&
      /エントリー受付中|募集中|受付中|応募はこちら|募集開始|エントリーはこちら/i.test(
        snippet,
      )
    ) {
      r.application_status = "open";
      r.evidence.application_status = e;
    } else if (
      r.application_status === "unknown" &&
      /公開予定|募集予定|受付開始予定/.test(snippet)
    ) {
      r.application_status = "upcoming";
      r.evidence.application_status = e;
    }
    const stepType: ParsedStep["type"] | undefined =
      /\bES\b|エントリーシート/i.test(snippet)
        ? "ES"
        : /Webテスト|適性検査|SPI/i.test(snippet)
          ? "WEB_TEST"
          : /最終面接/.test(snippet)
            ? "FINAL_INTERVIEW"
            : /面接/.test(snippet)
              ? "INTERVIEW"
              : undefined;
    if (
      stepType &&
      /締切|期限|提出|受験|実施日|面接日/.test(snippet) &&
      dates.length === 1
    ) {
      let step = r.selection_steps.find((s) => s.type === stepType);
      if (!step) {
        step = {
          title:
            stepType === "ES"
              ? "ES提出"
              : stepType === "WEB_TEST"
                ? "Webテスト"
                : stepType === "FINAL_INTERVIEW"
                  ? "最終面接"
                  : "面接",
          type: stepType,
          deadline: null,
          scheduled_at: null,
          order_index: r.selection_steps.length,
          evidence: e,
        };
        r.selection_steps.push(step);
      }
      if (/締切|期限|提出/.test(snippet)) step.deadline = dates[0].value;
      else step.scheduled_at = dates[0].value;
      step.evidence = e;
      r.evidence.selection_steps = e;
      continue;
    }
    if (stepType) continue;
    if (
      /応募期間|受付期間|エントリー期間/.test(snippet) &&
      dates.length === 2 &&
      /[〜~～]|から|まで|\s-\s/.test(snippet)
    ) {
      add("application_start", dates[0].value, e);
      add("application_deadline", dates[1].value, e);
      continue;
    }
    let field: string | undefined;
    if (/応募締切|エントリー締切|締切|受付期限|応募期限|提出期限/.test(snippet))
      field = "application_deadline";
    else if (
      /募集開始|応募開始|受付開始|エントリー開始|\bOPEN\b/i.test(snippet)
    )
      field = "application_start";
    else if (/開催日|開催期間|実施期間|インターン日程|実施日/.test(snippet)) {
      if (dates.length === 1) add("event_start", dates[0].value, e);
      if (dates.length === 2) {
        add("event_start", dates[0].value, e);
        add("event_end", dates[1].value, e);
      }
    }
    if (field) {
      for (const d of dates) add(field, d.value, e);
      if (!dates.length && /\d{1,2}[月/]/.test(snippet))
        r.warnings.push("年を確定できない日付は未設定にしました");
    }
  }
  for (const field of [
    "application_start",
    "application_deadline",
    "event_start",
    "event_end",
  ] as const) {
    const list = found.get(field) ?? [];
    if (list.length === 1) {
      r[field] = list[0].value;
      r.evidence[field] = list[0].evidence;
    } else if (list.length > 1)
      r.warnings.push(
        field + "に複数の日程があります。職種・日程の対応を確認してください",
      );
  }
  const notes = lines
    .filter((l) =>
      /予定|順次公開|未定|MyPage|マイページ|対象|応募資格|\d{4}.*卒/i.test(l),
    )
    .slice(0, 8);
  const eligibility = lines.find((l) => /応募資格|対象者|参加資格/.test(l));
  r.eligibility = eligibility ?? null;
  if (eligibility) r.evidence.eligibility = quote(eligibility);
  if (/MyPage|マイページ/i.test(text)) {
    r.warnings.push("詳細はMyPage内で確認が必要です");
  }
  if (!r.application_deadline) {
    r.warnings.push("締切日の記載は確認できませんでした");
    notes.push("締切日の記載は確認できませんでした");
  }
  if (!year)
    r.warnings.push(
      "卒年度を確認できませんでした。登録前に年度を確認してください",
    );
  if (!r.selection_steps.length)
    r.warnings.push("選考フローの記載を確認できませんでした");
  r.notes = notes.join("\n") || null;
  const sourceNotes = notes.filter(
    (n) => n !== "締切日の記載は確認できませんでした",
  );
  if (sourceNotes.length) r.evidence.notes = quote(sourceNotes.join("\n"));
  r.confidence = Math.min(
    1,
    (year?.valueOf() ? 0.2 : 0) +
      (r.job_category ? 0.1 : 0) +
      (r.selection_type !== "未発表" ? 0.15 : 0) +
      (r.application_deadline ? 0.2 : 0) +
      (r.application_start ? 0.1 : 0) +
      (r.selection_steps.length ? 0.15 : 0) +
      (official ? 0.1 : 0),
  );
  r.confidence = Number(r.confidence.toFixed(2));
  return r;
}
export function parseRecruitmentPage(
  page: RecruitmentPage,
  context: { companyName?: string; official?: boolean } = {},
): RecruitmentParseResult {
  const company = context.companyName || page.companyName;
  const pageYears = graduationYears(page.title + "\n" + page.text),
    globalYear = pageYears.length === 1 ? pageYears[0] : null;
  const groups: {
    heading: string;
    text: string;
    year: number | null;
    flow: string;
    level: number;
  }[] = [];
  let current = {
    heading: page.title,
    text: "",
    year: globalYear,
    flow: "",
    level: 0,
  };
  const sections: RecruitmentPage["sections"] = [];
  for (const section of page.sections) {
    let part = { ...section, text: "" },
      active = graduationYears(section.heading)[0] ?? null;
    for (const line of section.text.split("\n")) {
      const years = graduationYears(line);
      if (years.length === 1 && years[0] !== active) {
        if (part.text || part.heading) sections.push(part);
        part = { heading: line, level: section.level, text: "" };
        active = years[0];
      } else part.text += (part.text ? "\n" : "") + line;
    }
    sections.push(part);
  }
  for (const section of sections) {
    const localYears = graduationYears(section.heading),
      job = detectJob(section.heading);
    const newGroup =
      !!job || (localYears.length === 1 && localYears[0] !== current.year);
    if (newGroup && current.text) {
      groups.push(current);
      current = {
        heading: section.heading,
        text: "",
        year: localYears[0] ?? current.year ?? globalYear,
        flow: "",
        level: section.level,
      };
    } else if (localYears.length === 1) current.year = localYears[0];
    if (job) current.heading = section.heading;
    current.text += section.heading + "\n" + section.text + "\n";
    if (flowHeading.test(section.heading)) current.flow += section.text + "\n";
  }
  if (current.text) groups.push(current);
  const recruitments = groups
    .filter((g) =>
      /採用|募集|インターン|選考|卒|intern|career|recruit|entry/i.test(
        g.heading + g.text,
      ),
    )
    .map((g) =>
      parseBlock(
        page,
        g.heading,
        g.text,
        g.year,
        company,
        context.official ?? false,
        g.flow,
      ),
    );
  // A header-only wrapper should not become an extra recruitment when job sections exist.
  const useful = recruitments.some((r) => r.job_category)
    ? recruitments.filter(
        (r) =>
          r.job_category ||
          r.application_deadline ||
          r.application_start ||
          r.selection_steps.length ||
          r.event_start,
      )
    : recruitments;
  return parseResultSchema.parse({
    company_name: company,
    graduation_year: globalYear,
    recruitments: useful.slice(0, 30),
    warnings: useful.length ? [] : ["募集に関する本文が見つかりませんでした"],
  });
}
