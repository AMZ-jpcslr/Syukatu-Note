export const selectionTypes = [
  "本選考",
  "早期選考",
  "インターン",
  "採用直結インターン",
  "説明会",
  "その他",
] as const;
export const statuses = [
  "検討中",
  "応募予定",
  "応募済",
  "選考中",
  "内定",
  "不合格",
  "辞退",
] as const;
export const priorities = ["S", "A", "B", "C"] as const;
export const eventTypes = [
  "応募開始",
  "応募締切",
  "ES締切",
  "Webテスト",
  "一次面接",
  "二次面接",
  "最終面接",
  "GD",
  "インターン",
  "説明会",
  "その他",
] as const;
export type EventType = (typeof eventTypes)[number];
export interface Application {
  id: string;
  user_id: string;
  recruitment_template_id: string | null;
  company_id: string | null;
  company_name: string;
  industry: string;
  graduation_year: number;
  job_category: string;
  position_name: string;
  course_name: string;
  selection_type: (typeof selectionTypes)[number];
  application_start: string | null;
  application_deadline: string | null;
  url: string;
  location: string;
  priority: (typeof priorities)[number];
  status: (typeof statuses)[number];
  memo: string;
  research: string;
  tags: string[];
  created_at: string;
}
export interface Step {
  id: string;
  user_id: string;
  user_application_id: string;
  title: string;
  step_type: EventType;
  deadline: string | null;
  scheduled_at: string | null;
  completed: boolean;
  result: string;
  memo: string;
  url: string;
  order_index: number;
}
export interface Task {
  id: string;
  user_id: string;
  user_application_id: string;
  title: string;
  task_type: string;
  due_date: string | null;
  completed: boolean;
  memo: string;
  url: string;
}
export interface ESQuestion {
  id: string;
  user_id: string;
  user_application_id: string;
  question: string;
  max_length: number;
  answer: string;
  status: "下書き" | "完成" | "提出済み";
}
export interface Interview {
  id: string;
  user_id: string;
  user_application_id: string;
  scheduled_at: string;
  stage: string;
  format: "オンライン" | "対面";
  interviewer: string;
  questions: string;
  answers: string;
  reflection: string;
  result: string;
}
export interface PublicStep {
  title: string;
  step_type: EventType;
}
export interface Template {
  id: string;
  company_id: string;
  company_name: string;
  graduation_year: number;
  job_category: string;
  position_name: string;
  selection_type: (typeof selectionTypes)[number];
  application_start: string | null;
  application_deadline: string | null;
  url: string;
  public: boolean;
  public_flow: PublicStep[];
  created_by_user_id: string | null;
  created_at: string;
}
export interface Store {
  applications: Application[];
  steps: Step[];
  tasks: Task[];
  es: ESQuestion[];
  interviews: Interview[];
}
export interface CalendarEvent {
  id: string;
  applicationId: string;
  title: string;
  type: EventType;
  start: string;
  allDay: boolean;
  completed: boolean;
}
export type ChildTable =
  "selection_steps" | "tasks" | "es_questions" | "interview_notes";
export type Child = Step | Task | ESQuestion | Interview;
