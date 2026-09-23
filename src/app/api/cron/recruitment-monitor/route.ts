import { timingSafeEqual } from "node:crypto";
import {
  enqueueScheduledSources,
  processRecruitmentJobs,
} from "@/services/recruitment-monitor";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from("Bearer " + (secret ?? ""));
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  if (process.env.RECRUITMENT_MONITOR_ENABLED !== "true")
    return Response.json({ enabled: false });
  try {
    const queued = await enqueueScheduledSources();
    const processed = await processRecruitmentJobs(3);
    return Response.json({ queued, processed });
  } catch {
    return Response.json(
      {
        error:
          "監視処理に失敗しました。サーバー設定とジョブ状態を確認してください",
      },
      { status: 500 },
    );
  }
}
