import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "../src/lib/supabase-config";
describe("Supabase environment configuration", () => {
  it("reports exact missing variable names without exposing values", () => {
    const config = resolveSupabaseConfig({
      publishableKey: "private-test-value",
    });
    expect(config.isConfigured).toBe(false);
    expect(config.issues).toEqual(["NEXT_PUBLIC_SUPABASE_URL が未設定です"]);
    expect(config.issues.join()).not.toContain("private-test-value");
  });
  it("accepts a legacy public anon key and trims copied whitespace", () => {
    const config = resolveSupabaseConfig({
      url: " https://example.supabase.co\n",
      publishableKey: "  ",
      anonKey: " legacy-public-key ",
    });
    expect(config.isConfigured).toBe(true);
    expect(config.url).toBe("https://example.supabase.co");
    expect(config.key).toBe("legacy-public-key");
  });
  it("prefers the publishable key over the legacy key", () => {
    expect(
      resolveSupabaseConfig({
        url: "http://localhost:54321",
        publishableKey: "new-public-key",
        anonKey: "legacy-public-key",
      }).key,
    ).toBe("new-public-key");
  });
  it("rejects missing keys and invalid URLs with actionable errors", () => {
    expect(
      resolveSupabaseConfig({ url: "https://example.supabase.co" }).issues[0],
    ).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    const config = resolveSupabaseConfig({
      url: "not-a-url",
      publishableKey: "test",
    });
    expect(config.isConfigured).toBe(false);
    expect(config.issues[0]).toContain("有効な http / https");
    expect(config.issues[0]).not.toContain("not-a-url");
  });
});
