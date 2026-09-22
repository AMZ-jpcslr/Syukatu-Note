import { resolveSupabaseConfig } from "./supabase-config";
import { createClient } from "@supabase/supabase-js";
export const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
// Keep literal references: Next.js does not inline dynamic process.env lookups.
const config = resolveSupabaseConfig({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
export const isConfigured = config.isConfigured;
export const configurationError = config.issues.length
  ? config.issues.join("。") +
    "。Vercelの環境変数を確認し、設定後に新しいデプロイを作成してください。"
  : "";
export const supabase =
  isConfigured && !isDemo
    ? createClient(config.url, config.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
let identity: Promise<string> | undefined;
export function initializeUser(): Promise<string> {
  if (identity) return identity;
  const initialize = async () => {
    if (isDemo) {
      let id = localStorage.getItem("anonymous_user_id");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("anonymous_user_id", id);
      }
      return id;
    }
    if (!supabase) throw new Error(configurationError);
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    let id = session?.user.id;
    if (!id) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      id = data.user!.id;
    }
    const { error: profileError } = await supabase
      .from("anonymous_users")
      .upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
    if (profileError) throw profileError;
    localStorage.setItem("anonymous_user_id", id);
    return id;
  };
  // Serialize first access across tabs so one browser gets one anonymous identity.
  identity = (
    navigator.locks
      ? navigator.locks.request("shukatsu-initialize-identity", initialize)
      : initialize()
  ).catch((e) => {
    identity = undefined;
    throw e;
  });
  return identity;
}
