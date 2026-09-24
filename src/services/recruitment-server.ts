import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "../lib/supabase-config";

const firstValue = (...values: (string | undefined)[]) =>
  values.map((value) => value?.trim()).find(Boolean) ?? "";

function projectUrl() {
  return firstValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
}

function publicConnection() {
  // Keep literal references so Next.js can inline the browser's build-time configuration.
  // Never substitute a privileged server key for the public client used with a user JWT.
  const resolved = resolveSupabaseConfig({
    url: projectUrl(),
    publishableKey: firstValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_ANON_KEY,
    ),
  });
  if (!resolved.isConfigured)
    throw new Error(
      "自動取得APIのSupabase設定：" +
        resolved.issues.join("。") +
        "。VercelのProduction環境を確認し、保存後に再デプロイしてください（サーバー側はSUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEYにも対応）。",
    );
  return resolved;
}

export function monitorAdmin() {
  if (typeof window !== "undefined") throw new Error("Server only");
  const url = projectUrl();
  if (!url)
    throw new Error(
      "自動取得APIのNEXT_PUBLIC_SUPABASE_URL（またはSUPABASE_URL）が未設定です。",
    );
  const key = firstValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  );
  if (!key)
    throw new Error(
      "自動取得用のSUPABASE_SERVICE_ROLE_KEY（またはSUPABASE_SECRET_KEY）が未設定です。VercelのProduction環境に設定し、再デプロイしてください。",
    );
  if (!resolveSupabaseConfig({ url, publishableKey: key }).isConfigured)
    throw new Error(
      "自動取得APIのSupabase URLが不正です。Project URLを確認してください。",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedMonitor(
  request: Request,
): Promise<{ db: SupabaseClient; user: string }> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Authentication required");
  const { url, key } = publicConnection();
  const db = createClient(url, key, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Authentication required");
  return { db, user: data.user.id };
}
export function assertDb<T>(result: {
  data: T;
  error: { message: string } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
