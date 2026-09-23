import {
  pgTable,
  primaryKey,
  real,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  foreignKey,
  type PgColumn,
} from "drizzle-orm/pg-core";
import type { PublicStep } from "../lib/types";
const temporalColumns = () => ({
  application_start_value: text("application_start_value"),
  application_deadline_value: text("application_deadline_value"),
  event_start: text("event_start"),
  event_end: text("event_end"),
});
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const anonymousUsers = pgTable("anonymous_users", {
  id: uuid("id").primaryKey(),
  transfer_code_hash: text("transfer_code_hash"),
  transfer_expires_at: timestamp("transfer_expires_at", { withTimezone: true }),
  created_at: created(),
});
export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull().unique(),
  industry: text("industry").notNull().default(""),
  website: text("website").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  aliases: text("aliases").array().notNull().default([]),
  seed_key: text("seed_key").unique(),
});
export const templates = pgTable("recruitment_templates", {
  ...temporalColumns(),
  selection_flow_details: jsonb("selection_flow_details").notNull().default([]),
  eligibility: text("eligibility").notNull().default(""),
  field_evidence: jsonb("field_evidence").notNull().default({}),
  source_url: text("source_url"),
  source_type: text("source_type").notNull().default("user_submitted"),
  last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
  verification_status: text("verification_status")
    .notNull()
    .default("unverified"),
  application_status: text("application_status").notNull().default("unknown"),
  notes_public: text("notes_public").notNull().default(""),
  seed_key: text("seed_key").unique(),
  id: id(),
  company_id: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  company_name: text("company_name").notNull(),
  graduation_year: integer("graduation_year").notNull(),
  job_category: text("job_category").notNull(),
  position_name: text("position_name").notNull(),
  selection_type: text("selection_type").notNull(),
  application_start: date("application_start"),
  application_deadline: date("application_deadline"),
  deadline_type: text("deadline_type").notNull().default("date"),
  url: text("url").notNull().default(""),
  public: boolean("public").notNull().default(false),
  public_flow: jsonb("public_flow").$type<PublicStep[]>().notNull().default([]),
  created_by_user_id: uuid("created_by_user_id").references(
    () => anonymousUsers.id,
  ),
  created_at: created(),
});
export const applications = pgTable(
  "user_applications",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => anonymousUsers.id),
    recruitment_template_id: uuid("recruitment_template_id").references(
      () => templates.id,
      { onDelete: "set null" },
    ),
    company_id: uuid("company_id").references(() => companies.id),
    company_name: text("company_name").notNull(),
    industry: text("industry").notNull().default(""),
    graduation_year: integer("graduation_year").notNull(),
    job_category: text("job_category").notNull().default(""),
    position_name: text("position_name").notNull().default(""),
    ...temporalColumns(),
    calendar_exclusions: text("calendar_exclusions")
      .array()
      .notNull()
      .default([]),
    recruitment_notes: text("recruitment_notes").notNull().default(""),
    eligibility: text("eligibility").notNull().default(""),
    copied_application_deadline: date("copied_application_deadline"),
    copied_deadline_type: text("copied_deadline_type")
      .notNull()
      .default("date"),
    application_status: text("application_status").notNull().default("unknown"),
    last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
    course_name: text("course_name").notNull().default(""),
    selection_type: text("selection_type").notNull(),
    application_start: date("application_start"),
    application_deadline: date("application_deadline"),
    deadline_type: text("deadline_type").notNull().default("date"),
    url: text("url").notNull().default(""),
    location: text("location").notNull().default(""),
    priority: text("priority").notNull().default("B"),
    status: text("status").notNull().default("検討中"),
    memo: text("memo").notNull().default(""),
    research: text("research").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    created_at: created(),
  },
  (t) => [unique("application_owner").on(t.id, t.user_id)],
);
const owner = () => ({
  id: id(),
  user_id: uuid("user_id").notNull(),
  user_application_id: uuid("user_application_id").notNull(),
});
const ownerFK = (t: { user_application_id: PgColumn; user_id: PgColumn }) =>
  foreignKey({
    columns: [t.user_application_id, t.user_id],
    foreignColumns: [applications.id, applications.user_id],
  })
    .onDelete("cascade")
    .onUpdate("cascade");
export const steps = pgTable(
  "selection_steps",
  {
    ...owner(),
    title: text("title").notNull(),
    step_type: text("step_type").notNull(),
    deadline_value: text("deadline_value"),
    scheduled_value: text("scheduled_value"),
    calendar_enabled: boolean("calendar_enabled").notNull().default(true),
    state: text("state").notNull().default("未着手"),
    deadline: date("deadline"),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    completed: boolean("completed").notNull().default(false),
    result: text("result").notNull().default(""),
    memo: text("memo").notNull().default(""),
    url: text("url").notNull().default(""),
    order_index: integer("order_index").notNull().default(0),
  },
  (t) => [
    ownerFK(t),
    unique("step_owner_application").on(t.id, t.user_application_id, t.user_id),
  ],
);
export const tasks = pgTable(
  "tasks",
  {
    ...owner(),
    title: text("title").notNull(),
    selection_step_id: uuid("selection_step_id").unique(),
    task_type: text("task_type").notNull().default("その他"),
    due_date: date("due_date"),
    completed: boolean("completed").notNull().default(false),
    memo: text("memo").notNull().default(""),
    url: text("url").notNull().default(""),
  },
  (t) => [
    ownerFK(t),
    foreignKey({
      columns: [t.selection_step_id, t.user_application_id, t.user_id],
      foreignColumns: [steps.id, steps.user_application_id, steps.user_id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);
export const es = pgTable(
  "es_questions",
  {
    ...owner(),
    question: text("question").notNull(),
    max_length: integer("max_length").notNull().default(400),
    answer: text("answer").notNull().default(""),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    status: text("status").notNull().default("下書き"),
  },
  (t) => [ownerFK(t)],
);
export const interviews = pgTable(
  "interview_notes",
  {
    ...owner(),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    stage: text("stage").notNull(),
    format: text("format").notNull(),
    location_or_url: text("location_or_url").notNull().default(""),
    qa_pairs: jsonb("qa_pairs")
      .$type<{ question: string; answer: string }[]>()
      .notNull()
      .default([]),
    interviewer: text("interviewer").notNull().default(""),
    questions: text("questions").notNull().default(""),
    answers: text("answers").notNull().default(""),
    reflection: text("reflection").notNull().default(""),
    result: text("result").notNull().default(""),
  },
  (t) => [ownerFK(t)],
);

export const transferAttempts = pgTable("transfer_attempts", {
  user_id: uuid("user_id").primaryKey(),
  window_at: timestamp("window_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  attempts: integer("attempts").notNull().default(0),
});

export const userPreferences = pgTable("user_preferences", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => anonymousUsers.id),
  auto_create_tasks: boolean("auto_create_tasks").notNull().default(true),
  auto_calendar: boolean("auto_calendar").notNull().default(true),
});
export const watchlist = pgTable(
  "watchlist",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => anonymousUsers.id),
    recruitment_template_id: uuid("recruitment_template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    created_at: created(),
  },
  (t) => [unique().on(t.user_id, t.recruitment_template_id)],
);
export const templateReports = pgTable("template_reports", {
  id: id(),
  template_id: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => anonymousUsers.id),
  report_type: text("report_type").notNull(),
  comment: text("comment").notNull().default(""),
  created_at: created(),
});

const instant = (name: string) => timestamp(name, { withTimezone: true });
export const companySources = pgTable("company_sources", {
  id: id(),
  company_id: uuid("company_id").references(() => companies.id),
  company_name: text("company_name").notNull().default(""),
  owner_user_id: uuid("owner_user_id").references(() => anonymousUsers.id),
  source_type: text("source_type").notNull(),
  url: text("url").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  monitor_enabled: boolean("monitor_enabled").notNull().default(true),
  monitor_priority: text("monitor_priority").notNull().default("medium"),
  last_checked_at: instant("last_checked_at"),
  last_success_at: instant("last_success_at"),
  last_error: text("last_error"),
  last_result: text("last_result"),
  created_at: created(),
  updated_at: instant("updated_at").notNull().defaultNow(),
});
export const sourceSnapshots = pgTable(
  "company_source_snapshots",
  {
    id: id(),
    source_id: uuid("source_id")
      .notNull()
      .references(() => companySources.id, { onDelete: "cascade" }),
    content_hash: text("content_hash").notNull(),
    checked_at: instant("checked_at").notNull().defaultNow(),
    content_text: text("content_text").notNull().default(""),
    page_title: text("page_title").notNull().default(""),
    pages_json: jsonb("pages_json").notNull().default([]),
  },
  (t) => [unique().on(t.source_id, t.content_hash)],
);
export const monitorPreferences = pgTable("recruitment_monitor_preferences", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => anonymousUsers.id),
  auto_check: boolean("auto_check").notNull().default(true),
  ai_enabled: boolean("ai_enabled").notNull().default(false),
  notifications: boolean("notifications").notNull().default(true),
});
export const sourceSettings = pgTable(
  "company_source_settings",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => anonymousUsers.id),
    source_id: uuid("source_id")
      .notNull()
      .references(() => companySources.id, { onDelete: "cascade" }),
    monitor_enabled: boolean("monitor_enabled").notNull().default(true),
    monitor_priority: text("monitor_priority").notNull().default("medium"),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.source_id] })],
);
export const recruitmentReviewers = pgTable("recruitment_reviewers", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => anonymousUsers.id),
});
export const recruitmentJobs = pgTable("recruitment_monitor_jobs", {
  id: id(),
  source_id: uuid("source_id")
    .notNull()
    .references(() => companySources.id),
  company_key: text("company_key").notNull(),
  requested_by: uuid("requested_by").references(() => anonymousUsers.id),
  status: text("status").notNull().default("queued"),
  available_at: instant("available_at").notNull().defaultNow(),
  locked_at: instant("locked_at"),
  lease_token: uuid("lease_token"),
  attempts: integer("attempts").notNull().default(0),
  result: text("result"),
  rule_count: integer("rule_count").notNull().default(0),
  ai_count: integer("ai_count").notNull().default(0),
  created_at: created(),
  finished_at: instant("finished_at"),
});
export const recruitmentCandidates = pgTable(
  "recruitment_update_candidates",
  {
    id: id(),
    company_id: uuid("company_id").references(() => companies.id),
    template_id: uuid("template_id").references(() => templates.id),
    source_id: uuid("source_id")
      .notNull()
      .references(() => companySources.id),
    owner_user_id: uuid("owner_user_id").references(() => anonymousUsers.id),
    source_url: text("source_url").notNull(),
    parser_type: text("parser_type").notNull(),
    raw_extracted_json: jsonb("raw_extracted_json").notNull(),
    diff_json: jsonb("diff_json").notNull(),
    confidence: real("confidence").notNull(),
    important_update: boolean("important_update").notNull().default(false),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull().default("pending"),
    created_at: created(),
    reviewed_at: instant("reviewed_at"),
    reviewed_by_user_id: uuid("reviewed_by_user_id").references(
      () => anonymousUsers.id,
    ),
  },
  (t) => [unique().on(t.source_id, t.fingerprint)],
);
export const candidateReviews = pgTable(
  "recruitment_candidate_reviews",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => anonymousUsers.id),
    candidate_id: uuid("candidate_id")
      .notNull()
      .references(() => recruitmentCandidates.id),
    status: text("status").notNull(),
    selected_fields: text("selected_fields").array().notNull().default([]),
    application_id: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    created_at: created(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.candidate_id] })],
);
export const aiBudget = pgTable("recruitment_ai_budget", {
  month: text("month").primaryKey(),
  calls: integer("calls").notNull().default(0),
});
