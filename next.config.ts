import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { resolveSupabaseConfig } from "./src/lib/supabase-config";
import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default function nextConfig(phase: string): NextConfig {
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.VERCEL === "1" &&
    process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
  ) {
    const resolved = resolveSupabaseConfig({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    if (!resolved.isConfigured)
      throw new Error("[Supabase configuration] " + resolved.issues.join("。"));
  }
  return config;
}
