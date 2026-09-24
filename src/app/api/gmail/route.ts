import { z } from "zod";
import { cookies } from "next/headers";
import {
  webIdentity,
  jsonBody,
  limited,
  importError,
} from "@/services/import-server";
import { assertDb, monitorAdmin } from "@/services/recruitment-server";
import {
  gmailConfigured,
  startGmail,
  syncGmail,
  disconnectGmail,
} from "@/services/gmail";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const { user } = await webIdentity(request);
    const connection = assertDb(
      await monitorAdmin()
        .from("gmail_connections")
        .select("sync_enabled,last_synced_at,last_error")
        .eq("user_id", user)
        .maybeSingle(),
    );
    return Response.json(
      { configured: gmailConfigured(), connection },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return importError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user } = await webIdentity(request);
    await limited("gmail:" + user, 10, 3600);
    const body = z
      .object({
        action: z.enum(["connect", "disconnect", "sync", "enable", "disable"]),
      })
      .strict()
      .parse(await jsonBody(request, 1000));
    if (body.action === "connect") {
      const result = await startGmail(user);
      (await cookies()).set("career-gmail-state", result.browser, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/gmail",
        maxAge: 600,
      });
      return Response.json({ url: result.url });
    }
    if (body.action === "disconnect") {
      await disconnectGmail(user);
      return Response.json({ success: true });
    }
    if (body.action === "sync") return Response.json(await syncGmail(user));
    assertDb(
      await monitorAdmin()
        .from("gmail_connections")
        .update({ sync_enabled: body.action === "enable" })
        .eq("user_id", user),
    );
    return Response.json({ success: true });
  } catch (e) {
    return importError(e);
  }
}
