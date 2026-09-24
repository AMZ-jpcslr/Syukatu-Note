import { build, context } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
const dev = process.argv.includes("--watch");
const url = new URL(
  process.env.EXTENSION_APP_URL ??
    (dev ? "http://localhost:3000" : "https://syukatu-note.vercel.app"),
);
if (url.protocol !== "https:" && !(dev && url.hostname === "localhost"))
  throw new Error("Extension endpoint must use HTTPS");
const out = "packages/browser-extension/dist";
await mkdir(out, { recursive: true });
await copyFile(
  "packages/browser-extension/public/popup.html",
  out + "/popup.html",
);
await copyFile("public/icon-192.png", out + "/icon.png");
await writeFile(
  out + "/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "しゅうかつ手帳 — MyPage取り込み",
      version: "2.0.0",
      description:
        "自分が開いた採用ページから日程を抽出し、確認して手帳に取り込む拡張機能。",
      permissions: ["activeTab", "scripting", "storage", "contextMenus"],
      host_permissions: [url.origin + "/*"],
      action: { default_popup: "popup.html", default_title: "しゅうかつ手帳" },
      background: { service_worker: "background.js", type: "module" },
      icons: { 128: "icon.png" },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'none';",
      },
    },
    null,
    2,
  ),
);
const options = {
  entryPoints: [
    "packages/browser-extension/src/popup.tsx",
    "packages/browser-extension/src/background.ts",
  ],
  outdir: out,
  bundle: true,
  format: "esm",
  target: "chrome120",
  jsx: "automatic",
  minify: !dev,
  define: {
    __APP_URL__: JSON.stringify(url.origin),
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
  },
};
if (dev) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Extension watch: " + out + " → " + url.origin);
} else {
  await build(options);
  console.log("Built extension: " + out);
}
