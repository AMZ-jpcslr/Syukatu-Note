import { expect, it } from "vitest";
import { groupApplications, deadlineLabel } from "../src/lib/applications";
import { demoData, demoTemplates } from "../src/lib/demo";
import { eventsFromStore } from "../src/lib/dates";
import { deadlineChanged } from "../src/lib/templates";
import { exportCsv, parseCsv } from "../src/lib/csv";
it("groups roles by company master and exact normalized names without conflating subsidiaries", () => {
  const a = demoData("a").applications[0];
  const items = [
    { ...a, id: "1", company_name: "ＡＢＣ 株式会社", company_id: "master" },
    {
      ...a,
      id: "2",
      company_name: "ABC株式会社",
      company_id: null,
      job_category: "Engineer",
    },
    { ...a, id: "3", company_name: "ABC subsidiary", company_id: null },
    { ...a, id: "4", company_name: "ABC other name", company_id: "master" },
  ];
  const groups = groupApplications(items);
  expect(groups.map((g) => g.applications.length)).toEqual([3, 1]);
  expect(groupApplications([items[1]], items)[0].key).toBe("id:master");
  expect(
    groupApplications([
      ...items,
      { ...items[0], id: "5", company_id: "another" },
    ]),
  ).toHaveLength(4);
});
it("capacity deadlines have no fabricated calendar date and retain independent selection tasks", () => {
  const store = demoData("a");
  const a = store.applications[0];
  a.deadline_type = "capacity";
  a.application_deadline = null;
  expect(deadlineLabel(a)).toBe("定員に達し次第終了");
  expect(eventsFromStore(store).some((e) => e.id === a.id + "-close")).toBe(
    false,
  );
  a.application_deadline = "2028-11-01";
  expect(deadlineLabel(a)).toContain("最終締切 2028/11/1");
  a.application_status = "closed";
  expect(
    eventsFromStore(store).find((e) => e.id === a.id + "-close")?.completed,
  ).toBe(true);
  expect(
    eventsFromStore(store).some(
      (e) => e.applicationId === a.id && e.type === "一次面接" && !e.completed,
    ),
  ).toBe(true);
});
it("CSV preserves deadline settings and closure state", () => {
  const store = demoData("a");
  store.applications[0].deadline_type = "capacity";
  store.applications[0].application_deadline = null;
  store.applications[0].application_status = "closed";
  expect(parseCsv(exportCsv(store), "b").applications[0]).toMatchObject({
    deadline_type: "capacity",
    application_deadline: null,
    application_status: "closed",
  });
});
it("detects changed deadline type independently from a personal edit", () => {
  const a = demoData("a").applications[0],
    t = demoTemplates()[0];
  a.recruitment_template_id = t.id;
  a.copied_application_deadline = null;
  a.deadline_type = "capacity";
  expect(deadlineChanged(a, t)).toBe(false);
  t.deadline_type = "capacity";
  expect(deadlineChanged(a, t)).toBe(true);
  a.copied_deadline_type = "capacity";
  expect(deadlineChanged(a, t)).toBe(false);
});
