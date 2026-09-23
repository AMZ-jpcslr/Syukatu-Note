import { z } from "zod";
import { selectionTypes } from "./types";
export const sourceTypes = [
  "recruitment",
  "internship",
  "job_detail",
  "event",
  "mypage",
  "other",
] as const;
export const stepKinds = [
  "ENTRY",
  "ES",
  "WEB_TEST",
  "CODING_TEST",
  "GD",
  "INTERVIEW",
  "FINAL_INTERVIEW",
  "INTERNSHIP",
  "OFFER",
  "OTHER",
] as const;
export const evidenceSchema = z.object({
  source_url: z.string(),
  source_page_title: z.string(),
  evidence_text: z.string(),
});
export const temporalSchema = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true }),
  z.null(),
]);
export const parsedStepSchema = z.object({
  title: z.string(),
  type: z.enum(stepKinds),
  deadline: temporalSchema,
  scheduled_at: temporalSchema,
  order_index: z.number().int().min(0),
  evidence: evidenceSchema,
});
export const recruitmentSchema = z.object({
  company_name: z.string().nullable(),
  graduation_year: z.number().int().min(2020).max(2100).nullable(),
  position_name: z.string().nullable(),
  job_category: z.string().nullable(),
  selection_type: z.enum(selectionTypes),
  application_status: z.enum(["open", "upcoming", "closed", "unknown"]),
  deadline_type: z.enum(["date", "capacity"]),
  application_start: temporalSchema,
  application_deadline: temporalSchema,
  event_start: temporalSchema,
  event_end: temporalSchema,
  source_url: z.string(),
  selection_steps: z.array(parsedStepSchema).max(30),
  eligibility: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  evidence: z.record(z.string(), evidenceSchema),
});
export const parseResultSchema = z.object({
  company_name: z.string().nullable(),
  graduation_year: z.number().nullable(),
  recruitments: z.array(recruitmentSchema).max(30),
  warnings: z.array(z.string()),
});
export type Recruitment = z.infer<typeof recruitmentSchema>;
export type RecruitmentParseResult = z.infer<typeof parseResultSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type ParsedStep = z.infer<typeof parsedStepSchema>;
export type ParserType = "rule" | "gemini" | "hybrid";
export interface PageSection {
  heading: string;
  level: number;
  text: string;
}
export interface RecruitmentPage {
  url: string;
  title: string;
  description: string;
  text: string;
  sections: PageSection[];
  jsonLd: unknown[];
  links: { url: string; label: string }[];
  contentHash: string;
  companyName: string | null;
}
export const reviewFields = [
  "position_name",
  "job_category",
  "selection_type",
  "application_status",
  "deadline_type",
  "application_start",
  "application_deadline",
  "event_start",
  "event_end",
  "source_url",
  "selection_steps",
  "eligibility",
  "notes",
] as const;
export type ReviewField = (typeof reviewFields)[number];
export interface FieldDiff {
  before: unknown;
  after: unknown;
  evidence: Evidence | null;
}
export type RecruitmentDiff = Partial<Record<ReviewField, FieldDiff>>;
export interface RecruitmentCandidate {
  id: string;
  company_id: string | null;
  template_id: string | null;
  source_id: string;
  owner_user_id: string | null;
  source_url: string;
  parser_type: ParserType;
  raw_extracted_json: Recruitment;
  diff_json: RecruitmentDiff;
  confidence: number;
  status: "pending" | "approved" | "partially_approved" | "rejected";
  important_update: boolean;
  created_at: string;
  reviewed_at: string | null;
}
export interface CompanySource {
  id: string;
  company_id: string | null;
  company_name: string;
  owner_user_id: string | null;
  source_type: (typeof sourceTypes)[number];
  url: string;
  is_active: boolean;
  monitor_enabled: boolean;
  monitor_priority: "high" | "medium" | "low";
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_result: string | null;
}
export const fetchErrorLabels: Record<string, string> = {
  fetch_failed: "ページの取得に失敗しました",
  timeout: "ページ取得が時間切れになりました",
  robots_denied: "robots.txtにより取得できません",
  login_required: "ログイン・MyPage・CAPTCHAが必要なため自動取得できません",
  parsing_failed: "本文を解析できませんでした",
  no_relevant_info: "確認できる募集情報がありません",
  ssrf_blocked: "このURLは安全上取得できません",
  too_large: "ページのサイズが上限を超えています",
  ai_failed: "AI補助に失敗しました。ルール解析の結果を利用します",
  unchanged: "変更なし",
  success: "更新候補を作成しました",
};
export const confidenceLabel = (v: number) =>
  v >= 0.85 ? "High" : v >= 0.65 ? "Medium" : "Low";
export const stepEventType: Record<ParsedStep["type"], string> = {
  ENTRY: "応募開始",
  ES: "ES締切",
  WEB_TEST: "Webテスト",
  CODING_TEST: "その他",
  GD: "GD",
  INTERVIEW: "一次面接",
  FINAL_INTERVIEW: "最終面接",
  INTERNSHIP: "インターン",
  OFFER: "その他",
  OTHER: "その他",
};
