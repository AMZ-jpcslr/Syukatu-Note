import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { CalendarEvent, Store, EventType } from "./types";
export const todayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const dateKey = (value: string) =>
  value.length === 10 ? value : todayKey(new Date(value));
export function daysUntil(value: string, now = new Date()) {
  return differenceInCalendarDays(
    parseISO(dateKey(value)),
    parseISO(todayKey(now)),
  );
}
export function displayDate(value: string | null, pattern = "M/d") {
  return value ? format(parseISO(dateKey(value)), pattern) : "未設定";
}
export function jstTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function toInstant(local: string) {
  return local ? new Date(`${local}:00+09:00`).toISOString() : null;
}
export function toLocalInput(value: string) {
  return `${dateKey(value)}T${jstTime(value)}`;
}
export function urgency(value: string) {
  const d = daysUntil(value);
  return d < 0
    ? "overdue"
    : d === 0
      ? "urgent"
      : d <= 3
        ? "strong"
        : d <= 7
          ? "warning"
          : "normal";
}
export function eventClass(type: EventType) {
  return type === "応募開始"
    ? "opening"
    : type === "応募締切"
      ? "deadline"
      : type === "ES締切"
        ? "es"
        : type === "Webテスト"
          ? "test"
          : type.includes("面接") || type === "GD"
            ? "interview"
            : type === "インターン"
              ? "intern"
              : "other";
}
export function eventsFromStore(store: Store): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const names = new Map(store.applications.map((a) => [a.id, a.company_name]));
  const push = (
    id: string,
    app: string,
    title: string,
    type: EventType,
    start: string | null,
    completed = false,
  ) => {
    if (start)
      events.push({
        id,
        applicationId: app,
        title: `${names.get(app) ?? "企業"} · ${title}`,
        type,
        start,
        allDay: start.length === 10,
        completed,
      });
  };
  store.applications.forEach((a) => {
    push(`${a.id}-open`, a.id, "応募開始", "応募開始", a.application_start);
    push(
      `${a.id}-close`,
      a.id,
      "応募締切",
      "応募締切",
      a.application_deadline,
      ["応募済", "選考中", "内定", "不合格", "辞退"].includes(a.status),
    );
  });
  store.steps.forEach((s) => {
    push(
      `${s.id}-due`,
      s.user_application_id,
      s.title + " 締切",
      s.step_type,
      s.deadline,
      s.completed,
    );
    if (s.scheduled_at)
      push(
        `${s.id}-at`,
        s.user_application_id,
        s.title,
        s.step_type,
        s.scheduled_at,
        s.completed,
      );
  });
  store.tasks.forEach((t) =>
    push(
      t.id,
      t.user_application_id,
      t.title,
      t.task_type.includes("Webテスト")
        ? "Webテスト"
        : t.task_type.startsWith("ES")
          ? "ES締切"
          : t.task_type === "面接"
            ? "一次面接"
            : "その他",
      t.due_date,
      t.completed,
    ),
  );
  store.interviews.forEach((i) =>
    push(
      i.id,
      i.user_application_id,
      i.stage,
      i.stage.includes("最終")
        ? "最終面接"
        : i.stage.includes("二次")
          ? "二次面接"
          : "一次面接",
      i.scheduled_at,
      !!i.result,
    ),
  );
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
export function progress(store: Store, id: string) {
  const items = [...store.tasks, ...store.steps].filter(
    (x) => x.user_application_id === id,
  );
  const done = items.filter((x) => x.completed).length;
  return {
    done,
    total: items.length,
    percent: items.length ? Math.round((done / items.length) * 100) : 0,
  };
}
export function reminders(events: CalendarEvent[], now = new Date()) {
  return events.filter(
    (e) => !e.completed && [0, 1, 3, 7].includes(daysUntil(e.start, now)),
  );
}
