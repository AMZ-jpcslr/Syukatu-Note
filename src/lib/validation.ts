import { z } from "zod";
import { selectionTypes, priorities, statuses } from "./types";
const day = z.union([z.literal(""), z.iso.date()]);
export const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
    "http / https のURLを入力してください",
  );
export const applicationSchema = z
  .object({
    company_name: z.string().trim().min(1, "企業名を入力してください").max(120),
    industry: z.string().trim().max(80),
    graduation_year: z.number().int().min(2020).max(2100),
    job_category: z.string().trim().max(120),
    position_name: z.string().trim().max(160),
    course_name: z.string().trim().max(120),
    selection_type: z.enum(selectionTypes),
    application_start: day,
    application_deadline: day,
    url: safeUrl,
    location: z.string().max(120),
    priority: z.enum(priorities),
    status: z.enum(statuses),
    memo: z.string().max(20000),
    tags: z.string().max(500),
  })
  .refine(
    (v) =>
      !v.application_start ||
      !v.application_deadline ||
      v.application_start <= v.application_deadline,
    {
      message: "締切日は応募開始日以降にしてください",
      path: ["application_deadline"],
    },
  );
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const defaultApplication: ApplicationInput = {
  company_name: "",
  industry: "",
  graduation_year: 2028,
  job_category: "",
  position_name: "",
  course_name: "",
  selection_type: "本選考",
  application_start: "",
  application_deadline: "",
  url: "",
  location: "",
  priority: "B",
  status: "検討中",
  memo: "",
  tags: "",
};
