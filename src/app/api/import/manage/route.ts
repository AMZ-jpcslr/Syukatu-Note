import { refineImport } from "@/services/import-ai";
import { sanitizeExtraction } from "@/lib/import/parser";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  webIdentity,
  digest,
  jsonBody,
  limited,
  enqueueImport,
  importError,
} from "@/services/import-server";
import { assertDb, monitorAdmin } from "@/services/recruitment-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { user } = await webIdentity(request);
    const db = monitorAdmin();
    const tokens = assertDb(
      await db
        .from("extension_tokens")
        .select("id,label,expires_at,revoked_at,created_at")
        .eq("user_id", user)
        .is("revoked_at", null),
    );
    return Response.json(
      { tokens },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return importError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user } = await webIdentity(request);
    await limited("import-web:" + user);
    const body = z
      .discriminatedUnion("action", [
        z
          .object({ action: z.literal("refine"), extraction: z.unknown() })
          .strict(),
        z.object({ action: z.literal("pair") }).strict(),
        z.object({ action: z.literal("revoke"), id: z.uuid() }).strict(),
        z
          .object({
            action: z.literal("import"),
            extraction: z.unknown(),
            source: z.enum(["text", "official"]),
          })
          .strict(),
      ])
      .parse(await jsonBody(request));
    if (body.action === "refine")
      return Response.json({
        extraction: await refineImport(sanitizeExtraction(body.extraction)),
      });
    const db = monitorAdmin();
    if (body.action === "pair") {
      await limited("issue-pair:" + user, 5, 600);
      const code =
        "SHUKATSU-" +
        randomBytes(16).toString("hex").toUpperCase().match(/.{8}/g)!.join("-");
      assertDb(
        await db
          .from("extension_pairings")
          .delete()
          .eq("user_id", user)
          .is("used_at", null),
      );
      assertDb(
        await db
          .from("extension_pairings")
          .insert({
            user_id: user,
            code_hash: digest(code),
            expires_at: new Date(Date.now() + 600000).toISOString(),
          }),
      );
      return Response.json(
        { code, expiresInMinutes: 10 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.action === "revoke") {
      assertDb(
        await db
          .from("extension_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", body.id)
          .eq("user_id", user),
      );
      return Response.json({ success: true });
    }
    const id = await enqueueImport(user, body.source, body.extraction);
    return Response.json({ id });
  } catch (e) {
    return importError(e);
  }
}
