import { defaultPreferences, type Store, type Step } from "./types";
import { dateKey } from "./dates";
export const isStepDone = (state: string) =>
  ["完了", "合格", "不合格", "免除", "辞退"].includes(state);
export const characterCount = (value: string) => Array.from(value).length;
// Mirrors the PostgreSQL trigger for the explicit local demo only.
export function syncDemoStep(store: Store, step: Step) {
  const existing = store.tasks.find((t) => t.selection_step_id === step.id);
  const due =
    step.deadline ?? (step.scheduled_at ? dateKey(step.scheduled_at) : null);
  const enabled = (store.preferences ?? defaultPreferences).auto_create_tasks;
  if (!existing && (!due || !enabled)) return;
  const task = {
    id: existing?.id ?? crypto.randomUUID(),
    user_id: step.user_id,
    user_application_id: step.user_application_id,
    selection_step_id: step.id,
    title: step.step_type === "ES締切" ? "ES提出" : step.title,
    task_type: step.step_type,
    due_date: due,
    completed: step.completed,
    memo: existing?.memo ?? "",
    url: step.url,
  };
  store.tasks = [...store.tasks.filter((t) => t.id !== task.id), task];
}
