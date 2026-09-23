export const selectionTypes = [
  "本選考",
  "早期選考",
  "インターン",
  "採用直結インターン",
  "選考優遇インターン",
  "ワークショップ",
  "未発表",
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
export const priorities = ["S", "A", "B", "C", "未設定"] as const;
export const stepStatuses = [
  "未着手",
  "進行中",
  "完了",
  "合格",
  "不合格",
  "免除",
  "辞退",
] as const;
export const jobCategories = [
  "Product",
  "Product Manager",
  "Product Planner",
  "Business",
  "Business Development",
  "事業企画",
  "DX",
  "AI",
  "Data",
  "Software Engineer",
  "ML Engineer",
  "Security",
  "Research",
  "Consultant",
  "Trading",
  "Finance",
  "Marketing",
] as const;
export const applicationStatusLabels = {
  open: "募集中",
  upcoming: "今後公開予定",
  closed: "募集終了",
  unknown: "要確認",
};
export const verificationLabels = {
  verified: "確認済み",
  unverified: "未確認",
  outdated: "情報が古い可能性",
};
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
export type DeadlineType = "date" | "capacity";
export type RecruitmentStatus = "open" | "upcoming" | "closed" | "unknown";
export interface Application {
  application_start_value?: string | null;
  application_deadline_value?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  calendar_exclusions?: string[];
  recruitment_notes?: string;
  eligibility?: string;
  deadline_type?: DeadlineType;
  copied_deadline_type?: DeadlineType;
  application_status?: RecruitmentStatus;
  copied_application_deadline?: string | null;
  last_verified_at?: string | null;
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
  deadline_value?: string | null;
  scheduled_value?: string | null;
  calendar_enabled?: boolean;
  state?: (typeof stepStatuses)[number];
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
  selection_step_id?: string | null;
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
  status: "未着手" | "下書き" | "完成" | "提出済み";
  submitted_at?: string | null;
}
export interface Interview {
  location_or_url?: string;
  qa_pairs?: { question: string; answer: string }[];
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
  application_start_value?: string | null;
  application_deadline_value?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  selection_flow_details?: import("./recruitment").ParsedStep[];
  eligibility?: string;
  field_evidence?: Record<string, import("./recruitment").Evidence>;
  deadline_type?: DeadlineType;
  industry?: string;
  tags?: string[];
  aliases?: string[];
  source_url?: string | null;
  source_type?:
    "official" | "company_mypage" | "third_party" | "user_submitted";
  last_verified_at?: string | null;
  verification_status?: "verified" | "unverified" | "outdated";
  application_status?: "open" | "upcoming" | "closed" | "unknown";
  notes_public?: string;
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
  preferences?: Preferences;
  watchlist?: WatchlistItem[];
  applications: Application[];
  steps: Step[];
  tasks: Task[];
  es: ESQuestion[];
  interviews: Interview[];
}
export interface Preferences {
  auto_create_tasks: boolean;
  auto_calendar: boolean;
}
export interface WatchlistItem {
  id: string;
  user_id: string;
  recruitment_template_id: string;
  created_at: string;
}
export const defaultPreferences: Preferences = {
  auto_create_tasks: true,
  auto_calendar: true,
};
export interface CalendarEvent {
  id: string;
  applicationId: string;
  title: string;
  type: EventType;
  start: string;
  end?: string;
  allDay: boolean;
  completed: boolean;
}
export type ChildTable =
  "selection_steps" | "tasks" | "es_questions" | "interview_notes";
export type Child = Step | Task | ESQuestion | Interview;
