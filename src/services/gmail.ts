import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { load } from "cheerio";
import { assertDb, monitorAdmin } from "./recruitment-server";
import { appOrigin, digest, enqueueImport, secret } from "./import-server";
import { parsePage } from "../lib/import/parser";
import { cleanText } from "../lib/import/sanitize";
export const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
export function gmailConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY &&
    Buffer.from(process.env.GMAIL_TOKEN_ENCRYPTION_KEY, "base64").length === 32
  );
}
function encryptionKey() {
  const key = Buffer.from(
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? "",
    "base64",
  );
  if (key.length !== 32) throw new Error("Gmailの暗号化キーを設定してください");
  return key;
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function decryptToken(value: string) {
  const [iv, tag, data] = value.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
export async function startGmail(user: string) {
  if (!gmailConfigured())
    throw new Error(
      "Gmail連携は未設定です。Google OAuth設定を確認してください",
    );
  const state = secret(),
    browser = secret();
  assertDb(
    await monitorAdmin()
      .from("gmail_oauth_states")
      .insert({
        state_hash: digest(state),
        user_id: user,
        browser_hash: digest(browser),
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: appOrigin() + "/api/gmail/callback",
    response_type: "code",
    scope: gmailScope,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return { url: url.toString(), browser };
}
async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Google認証が失効しました。再接続してください");
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    scope?: string;
  }>;
}
export async function finishGmail(
  state: string,
  code: string,
  browser: string,
) {
  const db = monitorAdmin();
  const row = assertDb(
    await db
      .from("gmail_oauth_states")
      .select("*")
      .eq("state_hash", digest(state))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  );
  if (!row || !browser) throw new Error("認証の有効期限が切れました");
  const expected = Buffer.from(row.browser_hash),
    actual = Buffer.from(digest(browser));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("認証元のブラウザを確認できません");
  const consumed = assertDb(
    await db
      .from("gmail_oauth_states")
      .delete()
      .eq("state_hash", digest(state))
      .select("user_id")
      .maybeSingle(),
  );
  if (!consumed) throw new Error("使用済みの認証です");
  const tokens = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: appOrigin() + "/api/gmail/callback",
  });
  if (!tokens.refresh_token || !tokens.scope?.split(" ").includes(gmailScope))
    throw new Error("Gmail読み取り権限を確認してください");
  assertDb(
    await db.from("gmail_connections").upsert({
      user_id: row.user_id,
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      sync_enabled: false,
      last_error: null,
    }),
  );
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
export function mailText(part: GmailPart): string {
  if (part.mimeType?.startsWith("multipart/")) {
    const plain = part.parts?.filter((p) => p.mimeType === "text/plain");
    return (plain?.length ? plain : (part.parts ?? []))
      .map(mailText)
      .join("\n")
      .slice(0, 50000);
  }
  if (
    !["text/plain", "text/html"].includes(part.mimeType ?? "") ||
    !part.body?.data ||
    part.body.data.length > 200000
  )
    return "";
  const value = Buffer.from(part.body.data, "base64url").toString("utf8");
  if (part.mimeType === "text/plain") return value.slice(0, 50000);
  const $ = load(value);
  $(
    "script,style,form,input,textarea,select,[hidden],[aria-hidden=true],blockquote",
  ).remove();
  $("br").replaceWith("\n");
  $("p,div,li,tr,h1,h2,h3").append("\n");
  return $.root().text().slice(0, 50000);
}
export async function syncGmail(user: string) {
  const db = monitorAdmin(),
    connection = assertDb(
      await db
        .from("gmail_connections")
        .select("*")
        .eq("user_id", user)
        .maybeSingle(),
    );
  if (!connection?.sync_enabled)
    throw new Error("採用メールの自動解析をONにしてください");
  const lease = assertDb(
    await db
      .from("gmail_connections")
      .update({ lease_until: new Date(Date.now() + 300000).toISOString() })
      .eq("user_id", user)
      .or("lease_until.is.null,lease_until.lt." + new Date().toISOString())
      .select("user_id")
      .maybeSingle(),
  );
  if (!lease) return { busy: true };
  let imported = 0;
  const stopAt = Date.now() + 65000;
  let interrupted = false;
  try {
    const { access_token } = await tokenRequest({
      refresh_token: decryptToken(connection.refresh_token_encrypted),
      grant_type: "refresh_token",
    });
    const google = async (path: string) => {
      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/" + path,
        {
          headers: { Authorization: "Bearer " + access_token },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error("Gmailの取得に失敗しました");
      return response.json();
    };
    const query =
      "newer_than:7d {採用 新卒 選考 応募 エントリー 締切 面接 イベント インターン 適性検査 Webテスト}";
    const list = await google(
      "messages?" +
        new URLSearchParams({
          q: query,
          maxResults: "30",
          ...(connection.next_page_token
            ? { pageToken: connection.next_page_token }
            : {}),
        }),
    );
    for (const message of list.messages ?? []) {
      if (Date.now() >= stopAt) {
        interrupted = true;
        break;
      }
      const current = assertDb(
        await db
          .from("gmail_connections")
          .select("sync_enabled")
          .eq("user_id", user)
          .maybeSingle(),
      );
      if (!current?.sync_enabled) {
        interrupted = true;
        break;
      }
      const existing = assertDb(
        await db
          .from("data_sources")
          .select("id")
          .eq("user_id", user)
          .eq("type", "mail")
          .eq("gmail_message_id", message.id)
          .maybeSingle(),
      );
      if (existing) continue;
      const detail = await google(
        "messages/" + encodeURIComponent(message.id) + "?format=full",
      );
      const subject = cleanText(
        detail.payload?.headers?.find(
          (h: { name: string }) => h.name.toLowerCase() === "subject",
        )?.value ?? "",
        180,
      );
      const result = parsePage({
        text: subject + "\n" + mailText(detail.payload ?? {}),
        title: subject,
        url: "",
      });
      result.parserProvider = "mail";
      if (
        result.deadlines.length ||
        result.events.length ||
        result.detectedSelectionSteps.length
      ) {
        await enqueueImport(user, "mail", result, message.id);
        if (Number.isFinite(Number(detail.internalDate)))
          assertDb(
            await db
              .from("data_sources")
              .update({
                received_at: new Date(
                  Number(detail.internalDate),
                ).toISOString(),
              })
              .eq("user_id", user)
              .eq("type", "mail")
              .eq("gmail_message_id", message.id),
          );
        imported++;
      }
    }
    assertDb(
      await db
        .from("gmail_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: null,
          next_page_token: interrupted
            ? connection.next_page_token
            : (list.nextPageToken ?? null),
        })
        .eq("user_id", user),
    );
    return { imported };
  } catch {
    assertDb(
      await db
        .from("gmail_connections")
        .update({
          last_error:
            "同期できませんでした。接続を確認し、必要なら再認証してください。",
          next_page_token: null,
        })
        .eq("user_id", user),
    );
    throw new Error("Gmailの同期に失敗しました。再接続を確認してください");
  } finally {
    await db
      .from("gmail_connections")
      .update({ lease_until: null })
      .eq("user_id", user);
  }
}
export async function disconnectGmail(user: string) {
  const db = monitorAdmin(),
    connection = assertDb(
      await db
        .from("gmail_connections")
        .select("refresh_token_encrypted")
        .eq("user_id", user)
        .maybeSingle(),
    );
  assertDb(await db.from("gmail_connections").delete().eq("user_id", user));
  if (connection) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: decryptToken(connection.refresh_token_encrypted),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* Local credential deletion is already complete; users can also revoke in Google settings. */
    }
  }
}
