import Papa from "papaparse";
import { z } from "zod";
import { applicationSchema, safeUrl } from "./validation";
import {
  eventTypes,
  type Application,
  type Store,
  type Step,
  type Task,
} from "./types";
const nullableDate = z.union([z.iso.date(), z.null()]);
const stepSchema = z.object({
  title: z.string().trim().min(1).max(300),
  step_type: z.enum(eventTypes),
  deadline: nullableDate,
  scheduled_at: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completed: z.boolean(),
  result: z.string().max(20000),
  memo: z.string().max(20000),
  url: safeUrl,
  order_index: z.number().int().min(0),
});
const taskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  task_type: z.string().max(100),
  due_date: nullableDate,
  completed: z.boolean(),
  memo: z.string().max(20000),
  url: safeUrl,
});
export interface ImportBundle {
  applications: Application[];
  steps: Step[];
  tasks: Task[];
}
const columns = [
  "company_name",
  "industry",
  "graduation_year",
  "job_category",
  "position_name",
  "course_name",
  "selection_type",
  "application_start",
  "application_deadline",
  "url",
  "location",
  "priority",
  "status",
  "memo",
  "tags",
  "selection_steps",
  "tasks",
];
export function exportCsv(store: Store) {
  const data = store.applications.map((a) => ({
    company_name: a.company_name,
    industry: a.industry,
    graduation_year: a.graduation_year,
    job_category: a.job_category,
    position_name: a.position_name,
    course_name: a.course_name,
    selection_type: a.selection_type,
    application_start: a.application_start ?? "",
    application_deadline: a.application_deadline ?? "",
    url: a.url,
    location: a.location,
    priority: a.priority,
    status: a.status,
    memo: a.memo,
    tags: a.tags.join(", "),
    selection_steps: JSON.stringify(
      store.steps
        .filter((s) => s.user_application_id === a.id)
        .map(
          ({
            title,
            step_type,
            deadline,
            scheduled_at,
            completed,
            result,
            memo,
            url,
            order_index,
          }) => ({
            title,
            step_type,
            deadline,
            scheduled_at,
            completed,
            result,
            memo,
            url,
            order_index,
          }),
        ),
    ),
    tasks: JSON.stringify(
      store.tasks
        .filter((t) => t.user_application_id === a.id)
        .map(({ title, task_type, due_date, completed, memo, url }) => ({
          title,
          task_type,
          due_date,
          completed,
          memo,
          url,
        })),
    ),
  }));
  return (
    "\uFEFF" + Papa.unparse({ fields: columns, data }, { escapeFormulae: true })
  );
}
export function parseCsv(text: string, user: string): ImportBundle {
  const result = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transform: (value) =>
        /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value,
    },
  );
  if (result.errors.length)
    throw new Error("CSVの形式が不正です：" + result.errors[0].message);
  if (!result.data.length || result.data.length > 500)
    throw new Error("CSVは1〜500件の企業を含めてください。");
  const bundle: ImportBundle = { applications: [], steps: [], tasks: [] };
  for (const [index, row] of result.data.entries()) {
    try {
      const input = applicationSchema.parse({
        ...row,
        graduation_year: Number(row.graduation_year),
      });
      const id = crypto.randomUUID();
      bundle.applications.push({
        ...input,
        id,
        user_id: user,
        company_id: null,
        recruitment_template_id: null,
        application_start: input.application_start || null,
        application_deadline: input.application_deadline || null,
        research: "",
        tags: input.tags
          .split(/[,、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        created_at: new Date().toISOString(),
      });
      const owner = { user_id: user, user_application_id: id };
      const steps = z
        .array(stepSchema)
        .max(100)
        .parse(JSON.parse(row.selection_steps || "[]"));
      const tasks = z
        .array(taskSchema)
        .max(100)
        .parse(JSON.parse(row.tasks || "[]"));
      bundle.steps.push(
        ...steps.map((s) => ({ ...s, ...owner, id: crypto.randomUUID() })),
      );
      bundle.tasks.push(
        ...tasks.map((t) => ({ ...t, ...owner, id: crypto.randomUUID() })),
      );
    } catch (e) {
      throw new Error(
        `${index + 2}行目を確認してください：${e instanceof Error ? e.message : "入力が不正です"}`,
      );
    }
  }
  return bundle;
}
export function downloadFile(
  content: string,
  name: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
