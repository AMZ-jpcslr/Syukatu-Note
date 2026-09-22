import { expect, it } from "vitest";
import { demoData, demoTemplates } from "../src/lib/demo";
import { characterCount, syncDemoStep } from "../src/lib/workflow";
import { eventsFromStore, progress } from "../src/lib/dates";
import { deadlineChanged, similarTemplates } from "../src/lib/templates";
import {
  exportCsvFiles,
  parseCsvFiles,
  exportCsv,
  parseCsv,
} from "../src/lib/csv";
it("projects calendar dates once and respects calendar OFF without duplicate linked tasks", () => {
  const d = demoData("a");
  const step = d.steps[0];
  step.scheduled_at = "2028-10-03T05:00:00Z";
  syncDemoStep(d, step);
  syncDemoStep(d, step);
  expect(d.tasks.filter((t) => t.selection_step_id === step.id)).toHaveLength(
    1,
  );
  expect(
    eventsFromStore(d).filter((e) => e.id.startsWith(step.id)),
  ).toHaveLength(2);
  const linked = d.tasks.find((t) => t.selection_step_id === step.id)!;
  expect(eventsFromStore(d).some((e) => e.id === linked.id)).toBe(false);
  const count = progress(d, step.user_application_id).total;
  expect(count).toBe(
    d.steps.filter((s) => s.user_application_id === step.user_application_id)
      .length +
      d.tasks.filter(
        (t) =>
          t.user_application_id === step.user_application_id &&
          !t.selection_step_id,
      ).length,
  );
  d.preferences = { auto_calendar: false, auto_create_tasks: false };
  expect(eventsFromStore(d).some((e) => e.id.startsWith(step.id))).toBe(false);
});
it("counts Unicode code points for ES text", () => {
  expect(characterCount("学生時代😀")).toBe(5);
});
it("searches Japanese aliases for English company masters", () => {
  const t = {
    ...demoTemplates()[0],
    company_name: "Rakuten Group",
    aliases: ["楽天グループ", "楽天"],
  };
  expect(similarTemplates([t], "楽天")).toHaveLength(1);
});
it("detects deadline changes against the copied snapshot including unknown dates", () => {
  const a = demoData("a").applications[0];
  const t = demoTemplates()[0];
  a.recruitment_template_id = t.id;
  a.copied_application_deadline = null;
  t.application_deadline = "2028-10-10";
  expect(deadlineChanged(a, t)).toBe(true);
  a.copied_application_deadline = t.application_deadline;
  a.application_deadline = "2028-10-08";
  expect(deadlineChanged(a, t)).toBe(false);
  t.application_deadline = null;
  expect(deadlineChanged(a, t)).toBe(true);
});
it("round-trips the three CSV files and preserves linked tasks and private step state", () => {
  const d = demoData("a");
  d.steps[0].state = "進行中";
  syncDemoStep(d, d.steps[0]);
  d.applications[0].memo = "=not a formula";
  const files = exportCsvFiles(d);
  expect(Object.keys(files)).toEqual([
    "applications.csv",
    "selection_steps.csv",
    "tasks.csv",
  ]);
  const imported = parseCsvFiles(files, "b");
  expect(imported.applications).toHaveLength(d.applications.length);
  expect(imported.applications[0].memo).toBe("=not a formula");
  expect(imported.steps[0].state).toBe("進行中");
  expect(
    imported.tasks.find((t) => t.selection_step_id)?.selection_step_id,
  ).toBe(imported.steps[0].id);
  const legacy = parseCsv(exportCsv(d), "b");
  expect(legacy.tasks.find((t) => t.selection_step_id)?.selection_step_id).toBe(
    legacy.steps[0].id,
  );
});
it("rejects missing CSV files and orphan children", () => {
  const files = exportCsvFiles(demoData("a"));
  expect(() =>
    parseCsvFiles({ "applications.csv": files["applications.csv"] }, "b"),
  ).toThrow();
  files["tasks.csv"] = files["tasks.csv"].replace(/\r?\n[^,]+,/, "\nunknown,");
  expect(() => parseCsvFiles(files, "b")).toThrow();
});
