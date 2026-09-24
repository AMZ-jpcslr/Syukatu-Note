import { z } from "zod";
import {
  cors,
  digest,
  limited,
  secret,
  jsonBody,
  importError,
} from "@/services/import-server";
import { assertDb, monitorAdmin } from "@/services/recruitment-server";
export const runtime = "nodejs";
export async function OPTIONS(request: Request) {
  try {
    return new Response(null, { status: 204, headers: cors(request, true) });
  } catch {
    return new Response(null, { status: 403 });
  }
}
export async function POST(request: Request) {
  let headers: Record<string, string> = {};
  try {
    headers = cors(request, true);
    const origin = request.headers.get("origin")!;
    // Behind Vercel this header is supplied by the trusted edge; hash rather than persist IPs.
    const network = request.headers.get("x-vercel-forwarded-for") ?? "shared";
    await limited("pair-ip:" + digest(network + ":" + origin), 10, 600);
    const { code } = z
      .object({
        code: z.string().regex(/^SHUKATSU-[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/),
      })
      .strict()
      .parse(await jsonBody(request, 1000));
    const token = "EXT-" + secret();
    const ok = assertDb(
      await monitorAdmin().rpc("claim_extension_pairing", {
        code_digest: digest(code),
        token_digest: digest(token),
        origin_value: origin,
      }),
    );
    if (!ok) throw new Error("コードが無効・使用済み・期限切れです");
    return Response.json({ token, expiresInDays: 90 }, { headers });
  } catch (e) {
    return importError(e, headers);
  }
}
