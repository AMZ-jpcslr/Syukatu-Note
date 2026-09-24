import type { Application, Task } from "../types";
import { daysUntil } from "../dates";
export interface UserProfile {
  skills: string[];
  experiences: string[];
  interests: string[];
}
export const emptyProfile: UserProfile = {
  skills: [],
  experiences: [],
  interests: [],
};
export function estimatedMinutes(task: Pick<Task, "title" | "task_type">) {
  const text = task.title + " " + task.task_type;
  return /イベント予約|説明会予約/.test(text)
    ? 10
    : /ES|Webテスト|面接準備/.test(text)
      ? 60
      : /応募|エントリー/.test(text)
        ? 15
        : 30;
}
export function rankTask(
  task: Task,
  application: Application | undefined,
  now = new Date(),
) {
  const due = task.due_value ?? task.due_date,
    days = due ? daysUntil(due, now) : Infinity;
  const reasons: string[] = [];
  let score = 0;
  if (days <= 1) {
    score += 100;
    reasons.push(days < 0 ? "期限超過" : days === 0 ? "今日締切" : "明日まで");
  } else if (days <= 3) {
    score += 60;
    reasons.push("3日以内");
  } else if (days <= 7) {
    score += 30;
    reasons.push("今週の締切");
  }
  if (application?.priority === "S") {
    score += 40;
    reasons.push("志望度S");
  } else if (application?.priority === "A") {
    score += 20;
    reasons.push("志望度A");
  }
  if (application?.status === "選考中") {
    score += 20;
    reasons.push("選考中");
  }
  if (!task.completed) {
    score += 15;
    reasons.push("未完了");
  }
  return {
    task,
    application,
    score,
    reasons,
    minutes: task.estimated_minutes ?? estimatedMinutes(task),
  };
}
export function planToday(
  tasks: Task[],
  applications: Application[],
  budget: number,
  now = new Date(),
) {
  const ranked = tasks
    .filter((t) => !t.completed)
    .map((t) =>
      rankTask(
        t,
        applications.find((a) => a.id === t.user_application_id),
        now,
      ),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.minutes - b.minutes ||
        a.task.id.localeCompare(b.task.id),
    );
  let used = 0;
  const selected: typeof ranked = [],
    deferred: typeof ranked = [];
  for (const item of ranked) {
    if (used + item.minutes <= budget) {
      selected.push(item);
      used += item.minutes;
    } else deferred.push(item);
  }
  return { selected, deferred, used, remaining: Math.max(0, budget - used) };
}
export function matchProfile(profile: UserProfile, tags: string[]) {
  const normalize = (s: string) =>
    s.normalize("NFKC").toLowerCase().replace(/\s/g, "");
  const aliases: Record<string, string> = {
    英語: "english",
    人工知能: "ai",
    事業開発: "businessdevelopment",
    bizdev: "businessdevelopment",
    ロボティクス: "robotics",
    プロダクト: "product",
  };
  const key = (s: string) => aliases[normalize(s)] ?? normalize(s);
  const jobs = new Set(tags.map(key));
  return [
    ...new Set([
      ...profile.skills,
      ...profile.experiences,
      ...profile.interests,
    ]),
  ].filter((tag) => jobs.has(key(tag)));
}
