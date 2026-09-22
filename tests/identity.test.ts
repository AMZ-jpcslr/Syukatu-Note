import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      signInAnonymously: mocks.signInAnonymously,
    },
    from: () => ({ upsert: mocks.upsert }),
  }),
}));
let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal("navigator", {
    locks: { request: (_key: string, fn: () => Promise<string>) => fn() },
  });
  mocks.upsert.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("creates an anonymous session only on first access and coalesces simultaneous callers", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signInAnonymously.mockResolvedValue({
    data: { user: { id: "first-anonymous-user" } },
    error: null,
  });
  const { initializeUser } = await import("../src/lib/supabase");
  expect(await Promise.all([initializeUser(), initializeUser()])).toEqual([
    "first-anonymous-user",
    "first-anonymous-user",
  ]);
  expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1);
  expect(storage.get("anonymous_user_id")).toBe("first-anonymous-user");
});
it("reuses the authenticated session on revisits, ignoring a forged localStorage identity", async () => {
  storage.set("anonymous_user_id", "forged-id");
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "existing-session-user" } } },
    error: null,
  });
  const { initializeUser } = await import("../src/lib/supabase");
  expect(await initializeUser()).toBe("existing-session-user");
  expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  expect(mocks.upsert).toHaveBeenCalledWith(
    { id: "existing-session-user" },
    { onConflict: "id", ignoreDuplicates: true },
  );
});
