import { createClient } from "@supabase/supabase-js";
export const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const isConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
export const supabase =
  isConfigured && !isDemo
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      )
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
    if (!supabase)
      throw new Error(
        "Supabaseの環境変数が未設定です。READMEに沿って設定してください。",
      );
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
