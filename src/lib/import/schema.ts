import { z } from "zod";
import { selectionTypes } from "../types";
import { temporalSchema } from "../recruitment";
export const importKinds = [
  "ES_DEADLINE",
  "APPLICATION_DEADLINE",
  "WEB_TEST",
  "CODING_TEST",
  "INTERVIEW",
  "FINAL_INTERVIEW",
  "GD",
  "INTERNSHIP",
  "SESSION",
  "ENTRY",
  "OTHER",
] as const;
export const sourceLabels = {
  mypage: "MyPage",
  mail: "Mail",
  official: "Official",
  shared: "Shared",
  text: "Text",
};
export type ImportSource = keyof typeof sourceLabels;
export const sourceRank: Record<ImportSource, number> = {
  mypage: 5,
  mail: 4,
  official: 3,
  shared: 2,
  text: 1,
};
export const importItemSchema = z
  .object({
    key: z.string().max(180),
    type: z.enum(importKinds),
    title: z.string().min(1).max(160),
    date: temporalSchema,
    end: temporalSchema,
    dateLabel: z.string().max(80),
    evidence: z.string().max(360),
    order: z.number().int().min(0).max(99).nullable(),
  })
  .strict();
export const pageExtractionSchema = z
  .object({
    companyName: z.string().max(120).nullable(),
    pageUrl: z.string().max(1000),
    pageTitle: z.string().max(180),
    graduationYear: z.number().int().min(2020).max(2100).nullable(),
    recruitmentName: z.string().max(160).nullable(),
    positionName: z.string().max(120).nullable(),
    recruitmentType: z.enum(selectionTypes),
    deadlines: z.array(importItemSchema).max(30),
    events: z.array(importItemSchema).max(30),
    detectedSelectionSteps: z.array(importItemSchema).max(30),
    parserProvider: z.enum([
      "snar",
      "iweb",
      "hrmos",
      "recruiting-platform",
      "generic",
      "mail",
      "gemini",
    ]),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().max(160)).max(20),
    detectedStatus: z.string().max(30).nullable(),
  })
  .strict();
export type PageExtractionResult = z.infer<typeof pageExtractionSchema>;
export type ImportItem = z.infer<typeof importItemSchema>;
export interface InboxItem {
  id: string;
  user_id: string;
  source_id: string;
  source_type: ImportSource;
  raw_extracted_json: PageExtractionResult;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  previous_json: PageExtractionResult | null;
}
export interface ReviewImport {
  inbox_id: string;
  application_id: string | null;
  company_name: string;
  graduation_year: number;
  fields: string[];
  item_keys: string[];
  tasks: boolean;
  calendar: boolean;
  reject?: boolean;
  allow_override?: boolean;
}
export const reviewImportSchema = z
  .object({
    inbox_id: z.uuid(),
    application_id: z.uuid().nullable(),
    company_name: z.string().min(1).max(120),
    graduation_year: z.number().int().min(2020).max(2100),
    fields: z.array(z.enum(["company", "recruitment", "flow"])),
    item_keys: z.array(z.string().max(180)).max(90),
    tasks: z.boolean(),
    calendar: z.boolean(),
    reject: z.boolean().optional(),
    allow_override: z.boolean().optional(),
  })
  .strict();
export interface FieldOrigin {
  source_type: ImportSource | "manual";
  source_id?: string;
  evidence?: string;
  lastUpdated: string;
  userEdited: boolean;
}
export const itemEventType: Record<ImportItem["type"], string> = {
  ES_DEADLINE: "ES締切",
  APPLICATION_DEADLINE: "応募締切",
  WEB_TEST: "Webテスト",
  CODING_TEST: "その他",
  INTERVIEW: "一次面接",
  FINAL_INTERVIEW: "最終面接",
  GD: "GD",
  INTERNSHIP: "インターン",
  SESSION: "説明会",
  ENTRY: "応募開始",
  OTHER: "その他",
};
export const taskTitle: Record<ImportItem["type"], string> = {
  ES_DEADLINE: "ES提出",
  APPLICATION_DEADLINE: "応募",
  WEB_TEST: "Webテスト受験",
  CODING_TEST: "技術課題を提出",
  INTERVIEW: "面接準備・面接",
  FINAL_INTERVIEW: "最終面接準備・面接",
  GD: "GD準備",
  INTERNSHIP: "インターン準備",
  SESSION: "イベント予約",
  ENTRY: "応募",
  OTHER: "予定を確認",
};
