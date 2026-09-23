import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanySource,
  RecruitmentCandidate,
  RecruitmentPage,
} from "../lib/recruitment";
import type { Template } from "../lib/types";
import { crawlRecruitmentPages } from "./recruitment-fetcher";
import { parseRecruitmentPage } from "./recruitment-rule-parser";
import { withOptionalAI } from "./recruitment-ai-parser";
import {
  createRecruitmentDiff,
  isImportantUpdate,
  matchTemplate,
} from "./recruitment-diff";
import { assertDb, monitorAdmin } from "./recruitment-server";
import { contentHash } from "./recruitment-html";
export function combinedHash(pages: RecruitmentPage[]) {
  return contentHash(
    pages
      .map((p) => p.url + ":" + p.contentHash)
      .sort()
      .join("\n"),
  );
}
export async function analyzeChangedPages(
  pages: RecruitmentPage[],
  previousHash: string | null,
  context: {
    companyId: string | null;
    companyName: string;
    official: boolean;
    templates: Template[];
    aiEnabled: boolean;
    reserveCall?: () => Promise<boolean>;
  },
) {
  const hash = combinedHash(pages);
  if (hash === previousHash)
    return {
      hash,
      unchanged: true,
      candidates: [],
      ruleCount: 0,
      aiCount: 0,
      warnings: [] as string[],
    };
  const candidates: Partial<RecruitmentCandidate>[] = [];
  let ruleCount = 0,
    aiCount = 0;
  const warnings: string[] = [];
  for (const page of pages) {
    const rule = parseRecruitmentPage(page, {
      companyName: context.companyName,
      official: context.official,
    });
    ruleCount++;
    const parsed = await withOptionalAI(page, rule, {
      enabled: context.aiEnabled,
      reserveCall: context.reserveCall,
    });
    if (parsed.aiCalled) aiCount++;
    if (parsed.warning) warnings.push(parsed.warning);
    for (const r of parsed.result.recruitments) {
      const t = matchTemplate(context.companyId, r, context.templates),
        diff = createRecruitmentDiff(r, t);
      if (!Object.keys(diff).length) continue;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            hash,
            r.graduation_year,
            r.position_name,
            r.selection_type,
            diff,
          ]),
        )
        .digest("hex");
      candidates.push({
        template_id: t?.id ?? null,
        source_url: page.url,
        parser_type: parsed.parserType,
        raw_extracted_json: r,
        diff_json: diff,
        confidence: r.confidence,
        important_update: isImportantUpdate(r, diff),
        fingerprint,
      } as Partial<RecruitmentCandidate>);
    }
  }
  // Merge duplicate identity on multiple pages only when unambiguous; never join cohorts.
  const seen = new Set<string>();
  return {
    hash,
    unchanged: false,
    candidates: candidates.filter((c) => {
      const key = JSON.stringify([
        c.raw_extracted_json?.graduation_year,
        c.raw_extracted_json?.position_name,
        c.raw_extracted_json?.selection_type,
        c.diff_json,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    ruleCount,
    aiCount,
    warnings,
  };
}
interface Job {
  id: string;
  source_id: string;
  lease_token: string;
  requested_by: string | null;
}
export async function processRecruitmentJobs(
  limit = 3,
  wanted?: string,
  db: SupabaseClient = monitorAdmin(),
) {
  let done = 0;
  const started = Date.now();
  while (done < Math.min(limit, 3) && Date.now() - started < 210000) {
    const jobs = assertDb(
      await db.rpc("claim_recruitment_job", { wanted: wanted ?? null }),
    ) as Job[];
    const job = jobs?.[0];
    if (!job) break;
    let outcome = "fetch_failed",
      snapshot: Record<string, unknown> | null = null,
      candidates: Partial<RecruitmentCandidate>[] = [],
      rules = 0,
      ai = 0;
    try {
      const source = assertDb(
        await db
          .from("company_sources")
          .select("*")
          .eq("id", job.source_id)
          .single(),
      ) as CompanySource;
      if (source.source_type === "mypage") {
        outcome = "login_required";
      } else {
        let sources = [source];
        if (source.company_id) {
          let query = db
            .from("company_sources")
            .select("*")
            .eq("company_id", source.company_id)
            .eq("is_active", true)
            .neq("source_type", "mypage");
          query = source.owner_user_id
            ? query.eq("owner_user_id", source.owner_user_id)
            : query.is("owner_user_id", null);
          sources = assertDb(await query.limit(5)) as CompanySource[];
        }
        const crawled = await crawlRecruitmentPages([
          source.url,
          ...sources.filter((s) => s.id !== source.id).map((s) => s.url),
        ]);
        if (!crawled.pages.length) {
          outcome = crawled.errors[0]?.code ?? "no_relevant_info";
        } else {
          const previous = assertDb(
            await db
              .from("company_source_snapshots")
              .select("content_hash")
              .eq("source_id", source.id)
              .order("checked_at", { ascending: false })
              .limit(1),
          );
          const templates = source.company_id
            ? (assertDb(
                await db
                  .from("recruitment_templates")
                  .select("*")
                  .eq("company_id", source.company_id)
                  .eq("public", true),
              ) as Template[])
            : [];
          const prefs = job.requested_by
            ? assertDb(
                await db
                  .from("recruitment_monitor_preferences")
                  .select("ai_enabled")
                  .eq("user_id", job.requested_by)
                  .maybeSingle(),
              )
            : null;
          const parsed = await analyzeChangedPages(
            crawled.pages,
            previous?.[0]?.content_hash ?? null,
            {
              companyId: source.company_id,
              companyName: source.company_name,
              official: source.owner_user_id === null,
              templates,
              aiEnabled:
                process.env.RECRUITMENT_AI_ENABLED === "true" &&
                (job.requested_by ? !!prefs?.ai_enabled : true),
              reserveCall: async () =>
                !!assertDb(
                  await db.rpc("reserve_recruitment_ai_call", {
                    maximum: Number(
                      process.env.RECRUITMENT_AI_MONTHLY_LIMIT ?? 50,
                    ),
                  }),
                ),
            },
          );
          candidates = parsed.candidates;
          rules = parsed.ruleCount;
          ai = parsed.aiCount;
          outcome = parsed.unchanged
            ? "unchanged"
            : candidates.length
              ? "success"
              : "no_relevant_info";
          snapshot = {
            content_hash: parsed.hash,
            content_text: crawled.pages
              .map((p) => p.text)
              .join("\n")
              .slice(0, 50000),
            page_title: crawled.pages[0].title,
            pages_json: crawled.pages.map((p) => ({
              url: p.url,
              title: p.title,
              hash: p.contentHash,
            })),
          };
          if (crawled.errors.length || parsed.warnings.length) {
            for (const c of candidates)
              if (c.raw_extracted_json)
                c.raw_extracted_json.warnings.push(
                  ...parsed.warnings,
                  ...crawled.errors.map((e) => e.url + " : " + e.code),
                );
          }
        }
      }
    } catch (e) {
      outcome =
        e instanceof Error &&
        [
          "timeout",
          "robots_denied",
          "login_required",
          "ssrf_blocked",
          "parsing_failed",
          "no_relevant_info",
        ].includes(e.message)
          ? e.message
          : "fetch_failed";
    }
    assertDb(
      await db.rpc("complete_recruitment_job", {
        job: job.id,
        token: job.lease_token,
        snapshot,
        candidates,
        outcome,
        rules,
        ai,
      }),
    );
    done++;
    if (wanted) break;
    if (done < limit) await new Promise((r) => setTimeout(r, 3000));
  }
  return done;
}
export function priorityInterval(priority: string) {
  return priority === "high"
    ? 86400000
    : priority === "medium"
      ? 3.5 * 86400000
      : 7 * 86400000;
}
export async function enqueueScheduledSources(
  db: SupabaseClient = monitorAdmin(),
) {
  const sources = assertDb(
    await db
      .from("company_sources")
      .select("*")
      .eq("is_active", true)
      .eq("monitor_enabled", true),
  ) as CompanySource[];
  const settings =
    assertDb(await db.from("company_source_settings").select("*")) ?? [];
  const prefs =
    assertDb(await db.from("recruitment_monitor_preferences").select("*")) ??
    [];
  const due = sources
    .filter((s) => {
      const own = s.owner_user_id
        ? prefs.find((p) => p.user_id === s.owner_user_id)
        : null;
      if (own?.auto_check === false) return false;
      const subscriptions = settings.filter(
        (p) =>
          p.source_id === s.id &&
          p.monitor_enabled &&
          prefs.find((f) => f.user_id === p.user_id)?.auto_check !== false,
      );
      const ownSetting = settings.find(
        (p) => p.source_id === s.id && p.user_id === s.owner_user_id,
      );
      if (ownSetting?.monitor_enabled === false) return false;
      const priority =
        ownSetting?.monitor_priority ??
        (subscriptions.some((p) => p.monitor_priority === "high")
          ? "high"
          : s.monitor_priority);
      const interval = priorityInterval(priority);
      const checked = sources
        .filter(
          (p) =>
            p.company_id === s.company_id &&
            p.owner_user_id === s.owner_user_id &&
            (s.company_id || p.id === s.id),
        )
        .reduce(
          (n, p) => Math.max(n, Date.parse(p.last_checked_at ?? "") || 0),
          0,
        );
      return Date.now() - checked >= interval;
    })
    .sort(
      (a, b) =>
        priorityInterval(a.monitor_priority) -
        priorityInterval(b.monitor_priority),
    );
  const keys = new Set<string>();
  let queued = 0;
  for (const s of due) {
    const key = (s.company_id ?? s.id) + ":" + (s.owner_user_id ?? "public");
    if (keys.has(key)) continue;
    keys.add(key);
    const { error } = await db
      .from("recruitment_monitor_jobs")
      .insert({
        source_id: s.id,
        company_key: key,
        requested_by: s.owner_user_id,
        available_at: new Date(Date.now() + queued * 10000).toISOString(),
      });
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) queued++;
  }
  return queued;
}
