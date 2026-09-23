import type { Application, DeadlineType } from "./types";
import { displayDate } from "./dates";
// Only normalize typography. Subsidiaries and similarly named companies stay separate.
export const companyNameKey = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/\s/g, "");
export function groupApplications(items: Application[], all = items) {
  const idsByName = new Map<string, Set<string>>();
  for (const a of all) {
    if (!a.company_id) continue;
    const name = companyNameKey(a.company_name);
    const ids = idsByName.get(name) ?? new Set<string>();
    ids.add(a.company_id);
    idsByName.set(name, ids);
  }
  const groups = new Map<
    string,
    { key: string; name: string; applications: Application[] }
  >();
  for (const a of items) {
    const name = companyNameKey(a.company_name);
    const known = idsByName.get(name);
    const companyId =
      a.company_id ?? (known?.size === 1 ? [...known][0] : null);
    const key = companyId ? "id:" + companyId : "name:" + name;
    if (!groups.has(key))
      groups.set(key, { key, name: a.company_name, applications: [] });
    groups.get(key)!.applications.push(a);
  }
  return [...groups.values()];
}
export function deadlineLabel(
  a: { deadline_type?: DeadlineType; application_deadline: string | null },
  pattern = "yyyy/M/d",
) {
  const date = a.application_deadline
    ? displayDate(a.application_deadline, pattern)
    : null;
  return a.deadline_type === "capacity"
    ? "定員に達し次第終了" + (date ? "（最終締切 " + date + "）" : "")
    : (date ?? "未発表・要確認");
}
