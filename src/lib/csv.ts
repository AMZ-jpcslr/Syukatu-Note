import Papa from "papaparse";
import { z } from "zod";
import { applicationSchema, safeUrl } from "./validation";
import {
  eventTypes,
  stepStatuses,
  type Application,
  type Store,
  type Step,
  type Task,
  type ImportedEvent,
} from "./types";
import { temporalSchema } from "./recruitment";
const nullableDate = z.union([z.iso.date(), z.null()]);
const stepSchema = z.object({
  backup_key: z.string().optional(),
  deadline_value: temporalSchema.optional(),
  scheduled_value: temporalSchema.optional(),
  calendar_enabled: z.boolean().optional(),
  state: z.enum(stepStatuses).optional(),
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
  due_value: temporalSchema.optional(),
  estimated_minutes: z.number().int().min(1).max(1440).optional(),
  calendar_enabled: z.boolean().optional(),
  source_step_backup_key: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  task_type: z.string().max(100),
  due_date: nullableDate,
  completed: z.boolean(),
  memo: z.string().max(20000),
  url: safeUrl,
});
const importedEventSchema = z.object({
  title: z.string().min(1).max(300),
  event_type: z.enum(eventTypes),
  start_value: temporalSchema.refine((v) => !!v),
  end_value: temporalSchema,
  completed: z.boolean(),
});
export interface ImportBundle {
  applications: Application[];
  steps: Step[];
  tasks: Task[];
  importedEvents?: ImportedEvent[];
}
const columns = [
  "application_start_value",
  "application_deadline_value",
  "event_start",
  "event_end",
  "calendar_exclusions",
  "recruitment_notes",
  "eligibility",
  "company_name",
  "industry",
  "graduation_year",
  "job_category",
  "position_name",
  "course_name",
  "selection_type",
  "application_start",
  "application_deadline",
  "deadline_type",
  "application_status",
  "url",
  "location",
  "priority",
  "status",
  "memo",
  "tags",
  "selection_steps",
  "tasks",
  "imported_events",
];
export function exportCsv(store: Store) {
  const data = store.applications.map((a) => ({
    application_start_value: a.application_start_value ?? "",
    application_deadline_value: a.application_deadline_value ?? "",
    event_start: a.event_start ?? "",
    event_end: a.event_end ?? "",
    calendar_exclusions: JSON.stringify(a.calendar_exclusions ?? []),
    recruitment_notes: a.recruitment_notes ?? "",
    eligibility: a.eligibility ?? "",
    company_name: a.company_name,
    industry: a.industry,
    graduation_year: a.graduation_year,
    job_category: a.job_category,
    position_name: a.position_name,
    course_name: a.course_name,
    selection_type: a.selection_type,
    application_start: a.application_start ?? "",
    application_deadline: a.application_deadline ?? "",
    deadline_type: a.deadline_type ?? "date",
    application_status: a.application_status ?? "unknown",
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
            id: backup_key,
            deadline_value,
            scheduled_value,
            calendar_enabled,
            state,
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
            backup_key,
            deadline_value,
            scheduled_value,
            calendar_enabled,
            state,
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
    imported_events: JSON.stringify(
      (store.importedEvents ?? [])
        .filter((e) => e.user_application_id === a.id)
        .map(({ title, event_type, start_value, end_value, completed }) => ({
          title,
          event_type,
          start_value,
          end_value,
          completed,
        })),
    ),
    tasks: JSON.stringify(
      store.tasks
        .filter((t) => t.user_application_id === a.id)
        .map(
          ({
            selection_step_id,
            title,
            task_type,
            due_date,
            due_value,
            estimated_minutes,
            calendar_enabled,
            completed,
            memo,
            url,
          }) => ({
            source_step_backup_key: selection_step_id ?? null,
            title,
            task_type,
            due_date,
            due_value,
            estimated_minutes,
            calendar_enabled,
            completed,
            memo,
            url,
          }),
        ),
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
  const bundle: ImportBundle = {
    applications: [],
    steps: [],
    tasks: [],
    importedEvents: [],
  };
  for (const [index, row] of result.data.entries()) {
    try {
      const input = applicationSchema.parse({
        ...row,
        deadline_type: row.deadline_type || "date",
        application_status: row.application_status || "unknown",
        graduation_year: Number(row.graduation_year),
      });
      const id = crypto.randomUUID();
      bundle.applications.push({
        ...input,
        application_start_value: temporalSchema.parse(
          row.application_start_value || null,
        ),
        application_deadline_value: temporalSchema.parse(
          row.application_deadline_value || null,
        ),
        event_start: temporalSchema.parse(row.event_start || null),
        event_end: temporalSchema.parse(row.event_end || null),
        calendar_exclusions: z
          .array(
            z.enum([
              "application_start",
              "application_deadline",
              "event_start",
              "event_end",
            ]),
          )
          .parse(JSON.parse(row.calendar_exclusions || "[]")),
        recruitment_notes: z
          .string()
          .max(20000)
          .parse(row.recruitment_notes ?? ""),
        eligibility: z
          .string()
          .max(20000)
          .parse(row.eligibility ?? ""),
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
      const importedEvents = z
        .array(importedEventSchema)
        .max(200)
        .parse(JSON.parse(row.imported_events || "[]"));
      for (const event of importedEvents)
        bundle.importedEvents!.push({
          ...event,
          ...owner,
          id: crypto.randomUUID(),
          start_value: event.start_value!,
          import_key: "csv:" + crypto.randomUUID(),
          field_provenance: {
            start_value: {
              source_type: "manual",
              userEdited: true,
              lastUpdated: new Date().toISOString(),
            },
          },
        });
      const stepIds = new Map<string, string>();
      for (const { backup_key, ...s } of steps) {
        const sid = crypto.randomUUID();
        if (backup_key) stepIds.set(backup_key, sid);
        bundle.steps.push({ ...s, ...owner, id: sid });
      }
      for (const { source_step_backup_key, ...t } of tasks) {
        const linked = source_step_backup_key
          ? stepIds.get(source_step_backup_key)
          : null;
        if (source_step_backup_key && !linked)
          throw new Error("関連選考ステップが見つかりません");
        bundle.tasks.push({
          ...t,
          ...owner,
          id: crypto.randomUUID(),
          selection_step_id: linked ?? null,
        });
      }
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

export function exportCsvFiles(store: Store): Record<string, string> {
  const parsed = Papa.parse<Record<string, string>>(
    exportCsv(store).replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: true },
  ).data;
  const applications = parsed.map((a, i) => ({
    ...Object.fromEntries(
      Object.entries(a).filter(
        ([key]) => !["selection_steps", "tasks"].includes(key),
      ),
    ),
    backup_application_id: store.applications[i].id,
  }));
  const steps = parsed.flatMap((a, i) =>
    (JSON.parse(a.selection_steps) as Record<string, unknown>[]).map((s) => ({
      ...s,
      backup_application_id: store.applications[i].id,
    })),
  );
  const tasks = parsed.flatMap((a, i) =>
    (JSON.parse(a.tasks) as Record<string, unknown>[]).map((t) => ({
      ...t,
      backup_application_id: store.applications[i].id,
    })),
  );
  const csv = (rows: Record<string, unknown>[], fields: string[]) =>
    "\uFEFF" + Papa.unparse({ fields, data: rows }, { escapeFormulae: true });
  return {
    "applications.csv": csv(applications, [
      ...columns.filter((c) => !["selection_steps", "tasks"].includes(c)),
      "backup_application_id",
    ]),
    "selection_steps.csv": csv(steps, [
      "backup_application_id",
      "backup_key",
      "title",
      "step_type",
      "deadline",
      "scheduled_at",
      "deadline_value",
      "scheduled_value",
      "calendar_enabled",
      "completed",
      "state",
      "result",
      "memo",
      "url",
      "order_index",
    ]),
    "tasks.csv": csv(tasks, [
      "backup_application_id",
      "source_step_backup_key",
      "title",
      "task_type",
      "due_date",
      "due_value",
      "estimated_minutes",
      "calendar_enabled",
      "completed",
      "memo",
      "url",
    ]),
  };
}
export function parseCsvFiles(
  files: Record<string, string>,
  user: string,
): ImportBundle {
  for (const name of ["applications.csv", "selection_steps.csv", "tasks.csv"])
    if (!(name in files))
      throw new Error("3つのCSVをまとめて選択してください：" + name);
  const read = (name: string) => {
    const result = Papa.parse<Record<string, string>>(
      files[name].replace(/^\uFEFF/, ""),
      {
        header: true,
        skipEmptyLines: "greedy",
        transform: (v) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v),
      },
    );
    if (result.errors.length)
      throw new Error(name + ": " + result.errors[0].message);
    return result.data;
  };
  const apps = read("applications.csv"),
    steps = read("selection_steps.csv"),
    tasks = read("tasks.csv");
  const keys = new Set(apps.map((a) => a.backup_application_id));
  if (keys.size !== apps.length || keys.has(""))
    throw new Error("企業の関連IDが重複・未設定です");
  if ([...steps, ...tasks].some((c) => !keys.has(c.backup_application_id)))
    throw new Error("関連する企業が見つかりません");
  const bool = (v: string) => {
    if (!["true", "false"].includes(v)) throw new Error("完了状態が不正です");
    return v === "true";
  };
  const rows = apps.map((a) => ({
    ...a,
    selection_steps: JSON.stringify(
      steps
        .filter((s) => s.backup_application_id === a.backup_application_id)
        .map((s) => ({
          ...s,
          deadline: s.deadline || null,
          scheduled_at: s.scheduled_at || null,
          deadline_value: s.deadline_value || null,
          scheduled_value: s.scheduled_value || null,
          calendar_enabled: s.calendar_enabled
            ? bool(s.calendar_enabled)
            : true,
          completed: bool(s.completed),
          state: s.state || undefined,
          order_index: Number(s.order_index),
        })),
    ),
    tasks: JSON.stringify(
      tasks
        .filter((t) => t.backup_application_id === a.backup_application_id)
        .map((t) => ({
          ...t,
          due_date: t.due_date || null,
          due_value: t.due_value || null,
          estimated_minutes: t.estimated_minutes
            ? Number(t.estimated_minutes)
            : 30,
          calendar_enabled: t.calendar_enabled
            ? bool(t.calendar_enabled)
            : true,
          completed: bool(t.completed),
          source_step_backup_key: t.source_step_backup_key || null,
        })),
    ),
  }));
  return parseCsv(Papa.unparse(rows, { escapeFormulae: true }), user);
}
