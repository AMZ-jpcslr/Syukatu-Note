import { addDays, format, parseISO } from "date-fns";
import { todayKey } from "./dates";
import type { Application, Store, Template } from "./types";
export const demoCompanies = [
  ["マネーフォワード", "IT・SaaS", "事業企画職", "本選考"],
  ["SmartHR", "IT・SaaS", "ビジネス職", "本選考"],
  ["Sansan", "IT・SaaS", "ビジネス職", "本選考"],
  ["三井物産", "商社", "総合職", "本選考"],
  ["楽天グループ", "IT・通信", "ビジネス職", "本選考"],
  ["DENSO", "メーカー", "事務系 / DX・事業企画", "インターン"],
  ["みんなの銀行", "金融", "ビジネス職", "早期選考"],
] as const;
export const emptyStore = (): Store => ({
  applications: [],
  steps: [],
  tasks: [],
  es: [],
  interviews: [],
});
export function demoData(user: string): Store {
  const day = (d: number) =>
    format(addDays(parseISO(todayKey()), d), "yyyy-MM-dd");
  const applications: Application[] = demoCompanies.map(
    ([name, industry, job, selection], i) => ({
      id: crypto.randomUUID(),
      user_id: user,
      company_id: null,
      recruitment_template_id: null,
      company_name: name,
      industry,
      graduation_year: 2028,
      job_category: job,
      position_name: "2028卒 " + job,
      course_name: "",
      selection_type: selection,
      application_start: day(-8 + i),
      application_deadline: day([3, 8, 12, 5, 20, 7, 15][i]),
      url: "",
      location: "東京",
      priority: (["S", "A", "A", "S", "B", "B", "C"] as const)[i],
      status: (
        [
          "選考中",
          "応募済",
          "応募予定",
          "応募予定",
          "検討中",
          "選考中",
          "検討中",
        ] as const
      )[i],
      memo: "デモ用の架空日程です。実際の募集情報ではありません。",
      research: "",
      tags: [industry.split("・")[0]],
      created_at: new Date().toISOString(),
    }),
  );
  return {
    applications,
    steps: applications.flatMap((a, i) => [
      {
        id: crypto.randomUUID(),
        user_id: user,
        user_application_id: a.id,
        title: "エントリーシート提出",
        step_type: "ES締切" as const,
        deadline: day(i === 0 ? 0 : i + 2),
        scheduled_at: null,
        completed: i === 1,
        result: "",
        memo: "",
        url: "",
        order_index: 0,
      },
      {
        id: crypto.randomUUID(),
        user_id: user,
        user_application_id: a.id,
        title: "一次面接",
        step_type: "一次面接" as const,
        deadline: null,
        scheduled_at: day(i + 1) + "T05:00:00.000Z",
        completed: false,
        result: "",
        memo: "",
        url: "",
        order_index: 1,
      },
    ]),
    tasks: applications.slice(0, 4).map((a, i) => ({
      id: crypto.randomUUID(),
      user_id: user,
      user_application_id: a.id,
      title: [
        "ESの志望動機を仕上げる",
        "面接に向けて企業研究",
        "Webテストの模擬問題",
        "募集要項を確認する",
      ][i],
      task_type: ["ESを書く", "企業研究", "Webテスト対策", "その他"][i],
      due_date: day(i < 2 ? 0 : i),
      completed: false,
      memo: "",
      url: "",
    })),
    es: [],
    interviews: [],
  };
}
export function demoTemplates(): Template[] {
  return demoCompanies.map(([name, , job, selection], i) => ({
    id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    company_id: "00000000-0000-4000-9000-" + String(i + 1).padStart(12, "0"),
    company_name: name,
    graduation_year: 2028,
    job_category: job,
    position_name: "2028卒 " + job,
    selection_type: selection,
    application_start: null,
    application_deadline: null,
    url: "",
    public: true,
    public_flow: [
      { title: "ES提出", step_type: "ES締切" },
      { title: "Webテスト", step_type: "Webテスト" },
      { title: "一次面接", step_type: "一次面接" },
    ],
    created_by_user_id: null,
    created_at: "2026-01-01T00:00:00Z",
  }));
}
