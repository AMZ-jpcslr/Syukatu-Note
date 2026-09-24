import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import {
  authenticatedMonitor,
  monitorAdmin,
} from "../src/services/recruitment-server";
const names = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
];
const request = () =>
  new Request("https://example.com/api/recruitment-monitor", {
    headers: { Authorization: "Bearer user-jwt" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  for (const n of names) vi.stubEnv(n, "");
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "existing-anonymous-user" } },
    error: null,
  });
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
});
afterEach(() => vi.unstubAllEnvs());
it("uses the browser's anon key when the publishable key is empty or whitespace", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://test.supabase.co\n");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "  ");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " anon-key ");
  const result = await authenticatedMonitor(request());
  expect(result.user).toBe("existing-anonymous-user");
  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://test.supabase.co",
    "anon-key",
    expect.objectContaining({
      global: { headers: { Authorization: "Bearer user-jwt" } },
    }),
  );
  expect(mocks.getUser).toHaveBeenCalledWith("user-jwt");
});
it("supports integration server variable names without requiring new keys", async () => {
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  await authenticatedMonitor(request());
  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://test.supabase.co",
    "publishable-key",
    expect.anything(),
  );
});
it("prefers configured browser credentials over integration defaults", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://browser.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "browser-key");
  vi.stubEnv("SUPABASE_URL", "https://other.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "other-key");
  await authenticatedMonitor(request());
  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://browser.supabase.co",
    "browser-key",
    expect.anything(),
  );
});
it("reports missing public credentials without exposing secrets or using service-role privileges", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-service-key");
  await expect(authenticatedMonitor(request())).rejects.toThrow(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  expect(mocks.createClient).not.toHaveBeenCalled();
  try {
    await authenticatedMonitor(request());
  } catch (e) {
    expect(String(e)).not.toContain("private-service-key");
  }
});
it("reports missing URL distinctly from missing admin key", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  expect(() => monitorAdmin()).toThrow("SUPABASE_URL");
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect(() => monitorAdmin()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
});
it("uses the secret key when service-role is blank and never a public key", () => {
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "  ");
  vi.stubEnv("SUPABASE_SECRET_KEY", " server-secret ");
  monitorAdmin();
  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://test.supabase.co",
    "server-secret",
    expect.anything(),
  );
  mocks.createClient.mockClear();
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
  expect(() => monitorAdmin()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("still rejects missing or invalid anonymous sessions", async () => {
  await expect(
    authenticatedMonitor(new Request("https://example.com")),
  ).rejects.toThrow("Authentication required");
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "bad jwt" },
  });
  await expect(authenticatedMonitor(request())).rejects.toThrow(
    "Authentication required",
  );
});
