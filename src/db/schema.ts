import {
  pgTable,
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
});
export const templates = pgTable("recruitment_templates", {
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
    course_name: text("course_name").notNull().default(""),
    selection_type: text("selection_type").notNull(),
    application_start: date("application_start"),
    application_deadline: date("application_deadline"),
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
    deadline: date("deadline"),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    completed: boolean("completed").notNull().default(false),
    result: text("result").notNull().default(""),
    memo: text("memo").notNull().default(""),
    url: text("url").notNull().default(""),
    order_index: integer("order_index").notNull().default(0),
  },
  (t) => [ownerFK(t)],
);
export const tasks = pgTable(
  "tasks",
  {
    ...owner(),
    title: text("title").notNull(),
    task_type: text("task_type").notNull().default("その他"),
    due_date: date("due_date"),
    completed: boolean("completed").notNull().default(false),
    memo: text("memo").notNull().default(""),
    url: text("url").notNull().default(""),
  },
  (t) => [ownerFK(t)],
);
export const es = pgTable(
  "es_questions",
  {
    ...owner(),
    question: text("question").notNull(),
    max_length: integer("max_length").notNull().default(400),
    answer: text("answer").notNull().default(""),
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
