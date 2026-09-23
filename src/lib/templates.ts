import type { Application, PublicStep, Template } from "./types";
export function normalizeName(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|グループ|[\s・·\-ー]/g, "");
}
export function similarTemplates(
  templates: Template[],
  name: string,
  year?: number,
  job = "",
  position = "",
  limit = 6,
  includePrivate = false,
  selection = "",
) {
  const n = normalizeName(name);
  if (!n) return [];
  return templates
    .filter((t) => includePrivate || t.public)
    .map((t) => {
      const candidate = normalizeName(
        [t.company_name, ...(t.aliases ?? [])].join(" "),
      );
      let score =
        candidate === n
          ? 10
          : candidate.includes(n) || n.includes(candidate)
            ? 6
            : 0;
      if (!score) return { t, score };
      if (selection && t.selection_type === selection) score += 2;
      if (t.graduation_year === year) score += 3;
      if (job && normalizeName(t.job_category).includes(normalizeName(job)))
        score += 2;
      if (
        position &&
        normalizeName(t.position_name).includes(normalizeName(position))
      )
        score += 2;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}
// Strict allowlist: never spread a private application into public data.
export function publicPayload(a: Application, publicFlow: PublicStep[]) {
  return {
    company_name: a.company_name,
    graduation_year: a.graduation_year,
    job_category: a.job_category,
    position_name: a.position_name,
    selection_type: a.selection_type,
    application_start: a.application_start,
    application_deadline: a.application_deadline,
    deadline_type: a.deadline_type ?? "date",
    application_status: a.application_status ?? "unknown",
    url: a.url,
    public_flow: publicFlow.map((s) => ({
      title: s.title,
      step_type: s.step_type,
    })),
  };
}

export function deadlineChanged(a: Application, t: Template) {
  return (
    a.recruitment_template_id === t.id &&
    ((a.copied_application_deadline ?? null) !== t.application_deadline ||
      (a.copied_deadline_type ?? "date") !== (t.deadline_type ?? "date"))
  );
}
