import type { Template } from "../lib/types";
import {
  reviewFields,
  type Recruitment,
  type RecruitmentDiff,
} from "../lib/recruitment";
export const normalizedPosition = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/20\d{2}年?卒|\d{2}卒|[\s・/／_—–-]/g, "");
export function matchTemplate(
  companyId: string | null,
  r: Recruitment,
  templates: Template[],
) {
  if (!companyId || !r.graduation_year || !r.position_name) return null;
  const exact = templates.filter(
    (t) =>
      t.company_id === companyId &&
      t.graduation_year === r.graduation_year &&
      t.selection_type === r.selection_type &&
      normalizedPosition(t.position_name) ===
        normalizedPosition(r.position_name!),
  );
  if (exact.length === 1) return exact[0];
  const job = templates.filter(
    (t) =>
      t.company_id === companyId &&
      t.graduation_year === r.graduation_year &&
      t.selection_type === r.selection_type &&
      r.job_category &&
      normalizedPosition(t.job_category) === normalizedPosition(r.job_category),
  );
  return job.length === 1 ? job[0] : null;
}
export function templateValues(t: Template | null): Record<string, unknown> {
  if (!t) return {};
  return {
    ...t,
    source_url: t.source_url || t.url,
    application_start: t.application_start_value ?? t.application_start,
    application_deadline:
      t.application_deadline_value ?? t.application_deadline,
    selection_steps:
      (t.selection_flow_details?.length ? t.selection_flow_details : null) ??
      t.public_flow.map((s, i) => ({
        title: s.title,
        type: s.step_type,
        deadline: null,
        scheduled_at: null,
        order_index: i,
      })),
    notes: t.notes_public,
  };
}
export function createRecruitmentDiff(
  r: Recruitment,
  t: Template | null,
): RecruitmentDiff {
  const before = templateValues(t),
    diff: RecruitmentDiff = {};
  for (const key of reviewFields) {
    const after = r[key];
    if (
      after === null ||
      after === undefined ||
      after === "" ||
      (Array.isArray(after) && after.length === 0)
    )
      continue;
    // Unknown extraction never overwrites known facts. Missing dates are not a deletion.
    if (
      t &&
      ((key === "application_status" && after === "unknown") ||
        (key === "selection_type" && after === "未発表"))
    )
      continue;
    if (
      key === "deadline_type" &&
      after === "date" &&
      !r.application_deadline &&
      !r.evidence.deadline_type
    )
      continue;
    const prior = before[key] ?? null;
    const comparable = (v: unknown) =>
      key === "selection_steps" && Array.isArray(v)
        ? v.map((s) =>
            Object.fromEntries(
              Object.entries(s).filter(([k]) => k !== "evidence"),
            ),
          )
        : v;
    if (JSON.stringify(comparable(prior)) !== JSON.stringify(comparable(after)))
      diff[key] = { before: prior, after, evidence: r.evidence[key] ?? null };
  }
  return diff;
}
export function isImportantUpdate(
  r: Recruitment,
  diff: RecruitmentDiff,
  now = new Date(),
) {
  const days = r.application_deadline
    ? (Date.parse(r.application_deadline.slice(0, 10)) -
        Date.parse(now.toISOString().slice(0, 10))) /
      86400000
    : null;
  return (
    !!diff.application_deadline ||
    (r.application_status === "closed" && !!diff.application_status) ||
    (!!diff.application_start &&
      ["本選考", "早期選考", "採用直結インターン"].includes(
        r.selection_type,
      )) ||
    (days !== null && days >= 0 && days <= 7)
  );
}
