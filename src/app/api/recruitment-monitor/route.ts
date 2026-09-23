import { after } from "next/server";
import { z } from "zod";
import {
  authenticatedMonitor,
  assertDb,
  monitorAdmin,
} from "@/services/recruitment-server";
import { processRecruitmentJobs } from "@/services/recruitment-monitor";
import { resolvePublicUrl } from "@/services/recruitment-fetcher";
import { sourceTypes } from "@/lib/recruitment";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    url: z.string().max(2000),
    company_id: z.uuid().nullable(),
    company_name: z.string().max(120).default(""),
    source_type: z.enum(sourceTypes),
  }),
  z.object({ action: z.literal("check"), source_id: z.uuid() }),
  z.object({ action: z.literal("batch") }),
]);
export async function GET(request: Request) {
  try {
    const { db, user } = await authenticatedMonitor(request);
    const [
      sources,
      candidates,
      reviews,
      settings,
      preferences,
      reviewers,
      jobs,
    ] = await Promise.all([
      db.from("company_sources").select("*").order("company_name"),
      db
        .from("recruitment_update_candidates")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("recruitment_candidate_reviews").select("candidate_id"),
      db.from("company_source_settings").select("*"),
      db.from("recruitment_monitor_preferences").select("*").maybeSingle(),
      db.from("recruitment_reviewers").select("user_id").maybeSingle(),
      db
        .from("recruitment_monitor_jobs")
        .select("id,source_id,status,result,rule_count,ai_count,created_at")
        .gte(
          "created_at",
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
        )
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    const receipts = assertDb(reviews) ?? [];
    return Response.json(
      {
        userId: user,
        sources: assertDb(sources),
        candidates: (assertDb(candidates) ?? []).filter(
          (c) => !receipts.some((r) => r.candidate_id === c.id),
        ),
        settings: assertDb(settings),
        preferences: assertDb(preferences),
        canReviewPublic: !!assertDb(reviewers),
        jobs: assertDb(jobs),
        geminiConfigured: !!process.env.GEMINI_API_KEY,
        aiEnabled: process.env.RECRUITMENT_AI_ENABLED === "true",
        workerConfigured: !!(
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.SUPABASE_SECRET_KEY
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db } = await authenticatedMonitor(request);
    if (Number(request.headers.get("content-length") ?? 0) > 8192)
      return Response.json({ error: "入力が長すぎます" }, { status: 413 });
    const body = await request.text();
    if (body.length > 8192)
      return Response.json({ error: "入力が長すぎます" }, { status: 413 });
    const input = command.parse(JSON.parse(body));
    if (input.action === "add") {
      const safe = await resolvePublicUrl(input.url);
      if (/[?&](?:token|session|password|key|email|auth)=/i.test(safe.url.href))
        throw new Error(
          "公開URLを入力してください。認証情報付きURLは登録できません",
        );
      const id = assertDb(
        await db.rpc("add_company_source", {
          company: input.company_id,
          source_url: safe.url.href,
          kind: input.source_type,
          company_label: input.company_name,
        }),
      );
      return Response.json({ source_id: id });
    }
    monitorAdmin(); // Fail before enqueueing if the server worker is not configured.
    if (input.action === "check") {
      const id = assertDb(
        await db.rpc("request_recruitment_check", { source: input.source_id }),
      );
      after(async () => {
        try {
          await processRecruitmentJobs(1, id);
        } catch {
          console.error("Recruitment worker failed; queued job can be retried");
        }
      });
      return Response.json({ queued: 1, job_id: id }, { status: 202 });
    }
    const sources = assertDb(
      await db
        .from("company_sources")
        .select("id,company_id")
        .is("owner_user_id", null)
        .eq("is_active", true)
        .eq("monitor_enabled", true)
        .limit(100),
    );
    const companies = new Set<string>();
    let queued = 0;
    for (const s of sources ?? []) {
      const key = s.company_id ?? s.id;
      if (companies.has(key)) continue;
      companies.add(key);
      const { error } = await db.rpc("request_recruitment_check", {
        source: s.id,
      });
      if (!error) queued++;
    }
    after(async () => {
      try {
        await processRecruitmentJobs(3);
      } catch {
        console.error("Recruitment batch worker failed; cron will retry");
      }
    });
    return Response.json({ queued }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "処理に失敗しました";
  return Response.json(
    {
      error:
        message === "Authentication required"
          ? "再読み込みして匿名セッションを確認してください"
          : message,
    },
    {
      status: message === "Authentication required" ? 401 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
