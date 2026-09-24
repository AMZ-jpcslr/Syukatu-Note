import { timingSafeEqual } from "node:crypto";
import { gmailConfigured, syncGmail } from "@/services/gmail";
import { assertDb, monitorAdmin } from "@/services/recruitment-server";
export const runtime = "nodejs";
export const maxDuration = 300;
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
  if (!gmailConfigured()) return Response.json({ configured: false });
  try {
    const users = assertDb(
      await monitorAdmin()
        .from("gmail_connections")
        .select("user_id")
        .eq("sync_enabled", true)
        .or(
          "last_synced_at.is.null,last_synced_at.lt." +
            new Date(Date.now() - 3600000).toISOString(),
        )
        .order("last_synced_at", { nullsFirst: true })
        .limit(3),
    );
    let processed = 0;
    for (const user of users ?? []) {
      try {
        await syncGmail(user.user_id);
        processed++;
      } catch {
        /* Per-user status is saved; continue with next opted-in account. */
      }
    }
    return Response.json({ processed });
  } catch {
    return Response.json(
      { error: "Gmail同期処理に失敗しました" },
      { status: 500 },
    );
  }
}
