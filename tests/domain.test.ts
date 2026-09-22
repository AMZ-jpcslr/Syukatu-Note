import { describe, it, expect } from "vitest";
import {
  todayKey,
  daysUntil,
  eventsFromStore,
  progress,
  reminders,
  toInstant,
} from "../src/lib/dates";
import { applicationSchema, defaultApplication } from "../src/lib/validation";
import { publicPayload, similarTemplates } from "../src/lib/templates";
import { demoData, demoTemplates } from "../src/lib/demo";
import { exportCsv, parseCsv } from "../src/lib/csv";
describe("Japanese calendar and derived events", () => {
  it("uses Japan's date across a UTC day boundary", () => {
    const now = new Date("2026-09-21T15:30:00Z");
    expect(todayKey(now)).toBe("2026-09-22");
    expect(daysUntil("2026-09-22", now)).toBe(0);
    expect(toInstant("2026-09-22T14:00")).toBe("2026-09-22T05:00:00.000Z");
  });
  it("derives edits once and excludes completed events from reminders", () => {
    const d = demoData("u");
    const a = d.applications[0];
    a.application_deadline = "2026-09-22";
    a.status = "応募予定";
    expect(
      eventsFromStore(d).filter((e) => e.id === a.id + "-close"),
    ).toHaveLength(1);
    a.application_deadline = "2026-09-24";
    expect(
      eventsFromStore(d).find((e) => e.id === a.id + "-close")?.start,
    ).toBe("2026-09-24");
    a.status = "応募済";
    expect(
      reminders(eventsFromStore(d), new Date("2026-09-21T12:00:00Z")).some(
        (e) => e.id === a.id + "-close",
      ),
    ).toBe(false);
  });
  it("counts steps and tasks without division by zero", () => {
    const d = demoData("u");
    expect(progress(d, "missing").percent).toBe(0);
    const a = d.applications[0];
    d.tasks[0].completed = true;
    expect(progress(d, a.id)).toEqual({ done: 1, total: 3, percent: 33 });
  });
});
describe("validation and publication boundary", () => {
  it("rejects script URLs, reversed dates, invalid leap days and invalid years", () => {
    const valid = { ...defaultApplication, company_name: "企業" };
    for (const patch of [
      { url: "javascript:alert(1)" },
      { application_start: "2026-10-01", application_deadline: "2026-09-01" },
      { application_start: "2026-02-29" },
      { graduation_year: 3000 },
    ])
      expect(applicationSchema.safeParse({ ...valid, ...patch }).success).toBe(
        false,
      );
  });
  it("never publishes private fields", () => {
    const a = demoData("secret-owner").applications[0];
    a.memo = "private memo";
    a.research = "secret";
    const result = publicPayload(a, [
      { title: "一次面接", step_type: "一次面接" },
    ]);
    expect(Object.keys(result).sort()).toEqual(
      [
        "company_name",
        "graduation_year",
        "job_category",
        "position_name",
        "selection_type",
        "application_start",
        "application_deadline",
        "url",
        "public_flow",
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain("private memo");
  });
  it("finds normalized company names", () => {
    expect(
      similarTemplates(demoTemplates(), "株式会社 楽天", 2028)[0].company_name,
    ).toBe("楽天グループ");
    expect(similarTemplates(demoTemplates(), "存在しない企業")).toHaveLength(0);
  });
});
describe("CSV backup", () => {
  it("round trips quoted newlines, selections and tasks with fresh IDs", () => {
    const d = demoData("old");
    d.applications[0].memo = '日本語のメモ,改行\n"引用"';
    d.applications[1].memo = '=HYPERLINK("test")';
    const csv = exportCsv(d);
    expect(csv).toContain("'=HYPERLINK");
    const restored = parseCsv(csv, "new");
    expect(restored.applications[0].memo).toBe(d.applications[0].memo);
    expect(restored.applications[1].memo).toBe(d.applications[1].memo);
    expect(restored.applications[0].id).not.toBe(d.applications[0].id);
    expect(restored.steps).toHaveLength(d.steps.length);
    expect(restored.tasks).toHaveLength(d.tasks.length);
    expect(restored.steps[0].user_application_id).toBe(
      restored.applications[0].id,
    );
    expect(restored.applications.every((a) => a.user_id === "new")).toBe(true);
  });
  it("validates the entire file before import", () => {
    expect(() =>
      parseCsv("company_name,graduation_year\nBad,not-a-year", "u"),
    ).toThrow("2行目");
  });
});
