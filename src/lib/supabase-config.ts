export interface SupabaseEnvironment {
  url?: string;
  publishableKey?: string;
  anonKey?: string;
}

/** Receives statically referenced NEXT_PUBLIC variables; never expose their values in errors. */
export function resolveSupabaseConfig(env: SupabaseEnvironment) {
  const url = env.url?.trim() ?? "";
  const key = env.publishableKey?.trim() || env.anonKey?.trim() || "";
  const issues: string[] = [];
  if (!url) issues.push("NEXT_PUBLIC_SUPABASE_URL が未設定です");
  if (!key)
    issues.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（または NEXT_PUBLIC_SUPABASE_ANON_KEY）が未設定です",
    );
  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      issues.push(
        "NEXT_PUBLIC_SUPABASE_URL に有効な http / https のProject URLを設定してください",
      );
    }
  }
  return { url, key, isConfigured: issues.length === 0, issues };
}
