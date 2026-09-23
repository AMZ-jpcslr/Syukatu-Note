import { load } from "cheerio";
import { createHash } from "node:crypto";
import type { RecruitmentPage, PageSection } from "../lib/recruitment";
export function normalizeContent(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[ \t\u00a0]+/g, " ")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}
export function contentHash(text: string) {
  return createHash("sha256").update(normalizeContent(text)).digest("hex");
}
export function cleanRecruitmentHtml(
  html: string,
  url: string,
): RecruitmentPage {
  const $ = load(html);
  const title = $("title").first().text().trim().slice(0, 500);
  const description =
    $('meta[name="description"]').attr("content")?.slice(0, 1500) ?? "";
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(JSON.parse($(el).text()));
    } catch {}
  });
  const links: { url: string; label: string }[] = [];
  $("a[href]").each((_, el) => {
    try {
      const u = new URL($(el).attr("href")!, url);
      u.hash = "";
      if (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !/\.(pdf|png|jpg|zip|mp4)$/i.test(u.pathname) &&
        links.length < 300
      )
        links.push({ url: u.href, label: $(el).text().trim().slice(0, 200) });
    } catch {}
  });
  let companyName: string | null = null;
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (
      (o["@type"] === "Organization" || o["@type"] === "Corporation") &&
      typeof o.name === "string"
    )
      companyName = o.name.slice(0, 120);
    if (o.hiringOrganization && typeof o.hiringOrganization === "object") {
      const n = (o.hiringOrganization as Record<string, unknown>).name;
      if (typeof n === "string") companyName = n.slice(0, 120);
    }
    if (Array.isArray(o["@graph"])) o["@graph"].forEach(walk);
  };
  jsonLd.forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)));
  $(
    "script,style,nav,footer,aside,noscript,svg,iframe,form,[role=navigation],[role=banner],[role=complementary],[class*=cookie],[id*=cookie],[class*=Cookie],[class*=advert],.sidebar,#sidebar",
  ).remove();
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  root.find("h1,h2,h3,h4,h5,h6").each((_, el) => {
    $(el).replaceWith(
      "\n" +
        "#".repeat(Number(el.tagName.slice(1))) +
        " " +
        $(el).text() +
        "\n",
    );
  });
  root.find("th,td").each((_, el) => {
    $(el).append(" | ");
  });
  root.find("p,li,tr,dt,dd,section,div,br").each((_, el) => {
    $(el).append("\n");
  });
  const raw = normalizeContent(root.text());
  const seen = new Set<string>();
  const text = raw
    .split("\n")
    .filter((line) => {
      if (seen.has(line) && line.length > 30) return false;
      seen.add(line);
      return !/cookie.*(同意|accept)|すべてのCookie/i.test(line);
    })
    .join("\n")
    .slice(0, 50000);
  const sections: PageSection[] = [];
  let section: PageSection = { heading: title, level: 0, text: "" };
  for (const line of text.split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (section.text || section.heading) sections.push(section);
      section = { heading: heading[2], level: heading[1].length, text: "" };
    } else section.text += (section.text ? "\n" : "") + line;
  }
  sections.push(section);
  if (!companyName) {
    companyName =
      title
        .match(
          /(?:株式会社|有限会社)[^|｜\n]{1,45}|[^|｜\n]{1,45}(?:株式会社)/,
        )?.[0]
        ?.trim() ?? null;
  }
  return {
    url,
    title,
    description,
    text,
    sections,
    jsonLd: jsonLd.slice(0, 10),
    links,
    companyName,
    contentHash: contentHash(title + "\n" + description + "\n" + text),
  };
}
