import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), get: vi.fn(), auth: vi.fn() }));
vi.mock("../src/services/recruitment-server", () => ({
  monitorAdmin: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ gt: () => ({ maybeSingle: mocks.get }) }) }),
      }),
    }),
  }),
  assertDb: (r: { data: unknown; error: unknown }) => {
    if (r.error) throw r.error;
    return r.data;
  },
  authenticatedMonitor: mocks.auth,
}));
import {
  cors,
  extensionIdentity,
  jsonBody,
} from "../src/services/import-server";
const origin = "chrome-extension://" + "a".repeat(32),
  token = "EXT-" + "b".repeat(64);
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example");
  vi.stubEnv("EXTENSION_ORIGINS", origin);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.get.mockResolvedValue({
    data: { id: "device", user_id: "private-owner", extension_origin: origin },
    error: null,
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("rejects unexpected CORS origins and missing origin, without wildcard credentials", () => {
  expect(() =>
    cors(
      new Request("https://app.example/api", {
        headers: { Origin: "https://evil.example" },
      }),
    ),
  ).toThrow();
  expect(() => cors(new Request("https://app.example/api"))).toThrow();
  expect(
    cors(
      new Request("https://app.example/api", { headers: { Origin: origin } }),
      true,
    )["Access-Control-Allow-Origin"],
  ).toBe(origin);
});
it("authenticates extension with hashed scoped token and binds its origin", async () => {
  expect(
    await extensionIdentity(
      new Request("https://app.example/api", {
        headers: { Origin: origin, Authorization: "Bearer " + token },
      }),
    ),
  ).toMatchObject({ user: "private-owner" });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "import_rate_limit",
    expect.objectContaining({ bucket: "extension:device" }),
  );
  mocks.get.mockResolvedValue({
    data: {
      id: "device",
      user_id: "private-owner",
      extension_origin: "chrome-extension://" + "c".repeat(32),
    },
    error: null,
  });
  await expect(
    extensionIdentity(
      new Request("https://app.example/api", {
        headers: { Origin: origin, Authorization: "Bearer " + token },
      }),
    ),
  ).rejects.toThrow();
});
it("revoked/expired pairing cannot send, and internal UUID cannot be used as a token", async () => {
  mocks.get.mockResolvedValue({ data: null, error: null });
  await expect(
    extensionIdentity(
      new Request("https://app.example/api", {
        headers: { Origin: origin, Authorization: "Bearer " + token },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    extensionIdentity(
      new Request("https://app.example/api", {
        headers: {
          Origin: origin,
          Authorization: "Bearer aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      }),
    ),
  ).rejects.toThrow();
});
it("bounds request bodies and rejects simple form requests", async () => {
  await expect(
    jsonBody(
      new Request("https://app.example/api", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    ),
  ).rejects.toThrow();
  await expect(
    jsonBody(
      new Request("https://app.example/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(100) }),
      }),
      50,
    ),
  ).rejects.toThrow();
});
