import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { cleanRecruitmentHtml } from "./recruitment-html";
import type { RecruitmentPage } from "../lib/recruitment";
export const USER_AGENT =
  "CareerWorkspaceBot/1.0 (+https://syukatu-note.vercel.app/; public-recruitment-monitor)";
export class FetchFailure extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "FetchFailure";
  }
}
export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateFetchUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new FetchFailure("ssrf_blocked");
  }
  const host = u.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    (!host.includes(".") && !isIP(host)) ||
    (isIP(host) && !isPublicAddress(host)) ||
    host === "metadata.google.internal"
  )
    throw new FetchFailure("ssrf_blocked");
  u.hash = "";
  return u;
}
export async function resolvePublicUrl(value: string, resolver = lookup) {
  const url = validateFetchUrl(value),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new FetchFailure("ssrf_blocked");
  return { url, address: addresses[0].address, family: addresses[0].family };
}
export interface HttpResult {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
  url: string;
}
export async function fetchPublicUrl(
  value: string,
  timeoutMs = 10000,
): Promise<HttpResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FetchFailure("timeout")), timeoutMs);
  });
  let resolved: Awaited<ReturnType<typeof resolvePublicUrl>>;
  try {
    resolved = await Promise.race([resolvePublicUrl(value), timeout]);
  } catch (e) {
    throw e instanceof FetchFailure ? e : new FetchFailure("fetch_failed");
  } finally {
    clearTimeout(timer);
  }
  const { url, address, family } = resolved;
  return new Promise((resolve, reject) => {
    const fail = (e: Error) =>
      reject(e instanceof FetchFailure ? e : new FetchFailure("fetch_failed"));
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        agent: false,
        ...{ autoSelectFamily: false },
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Encoding": "identity",
        },
        // Pin the socket to the validated address: DNS rebinding cannot change the destination.
        lookup: (_host, _options, callback) => callback(null, address, family),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) {
            req.destroy(new FetchFailure("too_large"));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", fail);
        res.on("end", () => {
          try {
            let bytes = Buffer.concat(chunks);
            const enc = res.headers["content-encoding"];
            const opts = { maxOutputLength: 2_000_000 };
            if (enc === "gzip") bytes = gunzipSync(bytes, opts);
            else if (enc === "deflate") bytes = inflateSync(bytes, opts);
            else if (enc === "br") bytes = brotliDecompressSync(bytes, opts);
            const type = String(res.headers["content-type"] ?? "");
            const charset =
              type.match(/charset\s*=\s*["']?([^;"' ]+)/i)?.[1] ?? "utf-8";
            const headers = Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(",") : v,
              ]),
            );
            resolve({
              status: res.statusCode ?? 0,
              headers,
              body: new TextDecoder(charset).decode(bytes),
              url: url.href,
            });
          } catch {
            fail(new FetchFailure("parsing_failed"));
          }
        });
      },
    );
    const abort = setTimeout(
      () => req.destroy(new FetchFailure("timeout")),
      Math.max(1, timeoutMs - (Date.now() - started)),
    );
    req.on("error", fail);
    req.on("close", () => clearTimeout(abort));
    req.end();
  });
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function crawlRecruitmentPages(
  startUrls: string[],
  options: {
    fetcher?: typeof fetchPublicUrl;
    maxPages?: number;
    delayMs?: number;
  } = {},
) {
  const fetcher = options.fetcher ?? fetchPublicUrl,
    max = Math.min(options.maxPages ?? 5, 5);
  const queue = startUrls
    .slice(0, 5)
    .map((url) => ({ url: validateFetchUrl(url).href, depth: 0 }));
  const origins = new Set(queue.map((q) => new URL(q.url).origin));
  const canonical = (url: string) => url.replace(/\/$/, "");
  const seen = new Set<string>(),
    pages: RecruitmentPage[] = [],
    errors: { url: string; code: string }[] = [];
  const robots = new Map<string, ReturnType<typeof robotsParser>>();
  const lastAccess = new Map<string, number>();
  async function throttle(origin: string, delay: number) {
    const remaining = (lastAccess.get(origin) ?? 0) + delay - Date.now();
    if (remaining > 0) await wait(remaining);
    lastAccess.set(origin, Date.now());
  }
  async function policy(url: URL) {
    if (!robots.has(url.origin)) {
      await throttle(url.origin, options.delayMs ?? 2000);
      const robotsUrl = url.origin + "/robots.txt";
      const response = await fetcher(robotsUrl);
      // Fail closed on temporary failures, login walls and redirects.
      if (
        response.status !== 404 &&
        response.status !== 410 &&
        (response.status < 200 || response.status >= 300)
      )
        throw new FetchFailure("robots_denied");
      robots.set(
        url.origin,
        robotsParser(robotsUrl, response.status === 200 ? response.body : ""),
      );
    }
    const rules = robots.get(url.origin)!;
    if (rules.isAllowed(url.href, USER_AGENT) === false)
      throw new FetchFailure("robots_denied");
    const delay = Math.max(
      options.delayMs ?? 2000,
      (rules.getCrawlDelay(USER_AGENT) ?? 0) * 1000,
    );
    if (delay > 10000) throw new FetchFailure("robots_denied");
    await throttle(url.origin, delay);
  }
  let attempted = 0;
  while (queue.length && attempted < max) {
    const item = queue.shift()!;
    if (seen.has(canonical(item.url))) continue;
    seen.add(canonical(item.url));
    attempted++;
    try {
      let url = validateFetchUrl(item.url),
        response: HttpResult | undefined;
      if (/\/(login|signin|sign-in|auth)(\/|\?|$)/i.test(url.pathname))
        throw new FetchFailure("login_required");
      for (let redirect = 0; redirect <= 3; redirect++) {
        await policy(url);
        response = await fetcher(url.href);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.headers.location || redirect === 3)
            throw new FetchFailure("fetch_failed");
          const next = validateFetchUrl(
            new URL(response.headers.location, url).href,
          );
          // External redirects are not explored silently. Register that official URL separately.
          if (
            next.hostname !== url.hostname &&
            next.hostname.replace(/^www\./, "") !==
              url.hostname.replace(/^www\./, "")
          )
            throw new FetchFailure("fetch_failed");
          url = next;
          origins.add(url.origin);
          continue;
        }
        break;
      }
      if (!response || response.status === 401 || response.status === 403)
        throw new FetchFailure("login_required");
      if (response.status < 200 || response.status >= 300)
        throw new FetchFailure("fetch_failed");
      if (
        !/text\/html|application\/xhtml/i.test(
          response.headers["content-type"] ?? "",
        )
      )
        throw new FetchFailure("parsing_failed");
      const page = cleanRecruitmentHtml(response.body, url.href);
      if (
        /captcha|verify you are human|ログインが必要|ログインしてください|パスワードを入力/i.test(
          page.text,
        ) ||
        /type=["']password/i.test(response.body)
      )
        throw new FetchFailure("login_required");
      pages.push(page);
      if (item.depth < 2)
        for (const link of page.links) {
          if (
            origins.has(new URL(link.url).origin) &&
            /2028|28卒|新卒|採用|intern|インターン|募集要項|selection|entry|本選考|job|course/i.test(
              link.label + " " + link.url,
            ) &&
            !seen.has(canonical(link.url))
          )
            queue.push({ url: link.url, depth: item.depth + 1 });
        }
      queue.sort(
        (a, b) =>
          (/2028|28卒/.test(b.url) ? 1 : 0) -
            (/2028|28卒/.test(a.url) ? 1 : 0) || a.depth - b.depth,
      );
    } catch (e) {
      errors.push({
        url: item.url,
        code: e instanceof FetchFailure ? e.code : "fetch_failed",
      });
    }
  }
  return { pages, errors };
}
