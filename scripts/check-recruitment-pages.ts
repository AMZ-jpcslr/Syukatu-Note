import { writeFile, mkdir } from "node:fs/promises";
import { crawlRecruitmentPages } from "../src/services/recruitment-fetcher";
import { analyzeChangedPages } from "../src/services/recruitment-monitor";
const companies = [
  { name: "Money Forward", url: "https://recruit.moneyforward.com/students/" },
  { name: "NEC", url: "https://jpn.nec.com/recruit/newgraduate/" },
  { name: "NTT東日本", url: "https://newgrad.ntt-east.co.jp/" },
];
const reports = [];
for (const company of companies) {
  const fetched = await crawlRecruitmentPages([company.url]);
  const parsed = await analyzeChangedPages(fetched.pages, null, {
    companyId: null,
    companyName: company.name,
    official: true,
    templates: [],
    aiEnabled: false,
  });
  const repeat = await analyzeChangedPages(fetched.pages, parsed.hash, {
    companyId: null,
    companyName: company.name,
    official: true,
    templates: [],
    aiEnabled: false,
  });
  const report = {
    company: company.name,
    url: company.url,
    checked_at: new Date().toISOString(),
    pages: fetched.pages.map((p) => ({
      url: p.url,
      title: p.title,
      characters: p.text.length,
    })),
    errors: fetched.errors,
    candidates: parsed.candidates,
    unchanged_skips_parsing:
      repeat.unchanged && repeat.ruleCount === 0 && repeat.aiCount === 0,
  };
  reports.push(report);
  console.log(
    company.name,
    JSON.stringify({
      pages: report.pages,
      errors: report.errors,
      candidates: report.candidates.length,
    }),
  );
}
await mkdir("reports", { recursive: true });
await writeFile(
  "reports/recruitment-live-check.json",
  JSON.stringify(reports, null, 2),
);
