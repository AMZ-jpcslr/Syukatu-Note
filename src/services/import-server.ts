import { createHash, randomBytes } from "node:crypto";
import {
  authenticatedMonitor,
  assertDb,
  monitorAdmin,
} from "./recruitment-server";
import { sanitizeExtraction } from "../lib/import/parser";
import type { ImportSource } from "../lib/import/schema";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("hex");
export function appOrigin() {
  return new URL(process.env.APP_URL ?? "https://syukatu-note.vercel.app")
    .origin;
}
export function extensionOrigins() {
  return (process.env.EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^chrome-extension:\/\/[a-p]{32}$/.test(s));
}
export function cors(
  request: Request,
  extensionOnly = false,
): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed =
    origin === appOrigin() ||
    (process.env.NODE_ENV !== "production" &&
      origin === new URL(request.url).origin) ||
    (!!origin && extensionOrigins().includes(origin));
  if (
    !origin ||
    !allowed ||
    (extensionOnly && !extensionOrigins().includes(origin))
  )
    throw new Error("許可されていない送信元です");
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}
export async function limited(bucket: string, maximum = 60, seconds = 3600) {
  const allowed = assertDb(
    await monitorAdmin().rpc("import_rate_limit", {
      bucket,
      maximum,
      window_seconds: seconds,
    }),
  );
  if (!allowed) throw new Error("操作回数の上限です。しばらく待ってください");
}
export async function jsonBody(
  request: Request,
  limit = 65000,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSONが必要です");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("本文がありません");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("データが大きすぎます");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function webIdentity(request: Request) {
  if (request.method !== "GET") cors(request);
  return authenticatedMonitor(request);
}
export async function extensionIdentity(request: Request) {
  const headers = cors(request, true);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (EXT-[a-f0-9]{64})$/)?.[1];
  if (!token) throw new Error("拡張をペアリングしてください");
  const row = assertDb(
    await monitorAdmin()
      .from("extension_tokens")
      .select("id,user_id,extension_origin")
      .eq("token_hash", digest(token))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  );
  if (!row || row.extension_origin !== request.headers.get("origin"))
    throw new Error("ペアリングが失効しています");
  await limited("extension:" + row.id);
  return { user: row.user_id as string, headers };
}
export async function enqueueImport(
  user: string,
  source: ImportSource,
  input: unknown,
  ref?: string,
) {
  const extraction = sanitizeExtraction(input);
  if (
    !extraction.deadlines.length &&
    !extraction.events.length &&
    !extraction.detectedSelectionSteps.length
  )
    throw new Error(
      "日程または選考を検出できませんでした。取り込み範囲を確認してください",
    );
  const hash = digest(JSON.stringify(extraction));
  const sourceRef =
    ref ??
    (extraction.pageUrl ||
      "text:" + digest(extraction.companyName + ":" + extraction.pageTitle));
  return assertDb(
    await monitorAdmin().rpc("enqueue_private_import", {
      owner_id: user,
      kind: source,
      ref: sourceRef,
      extraction,
      digest: hash,
    }),
  );
}
export function importError(
  error: unknown,
  headers: Record<string, string> = {},
) {
  // Never include request payloads, SQL internals or OAuth responses in client errors.
  const message =
    error instanceof Error && /[ぁ-んァ-ヶ]/.test(error.message)
      ? error.message
      : "取り込みに失敗しました。接続・権限・migration 006の適用を確認してください";
  return Response.json(
    { error: message },
    { status: 400, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
