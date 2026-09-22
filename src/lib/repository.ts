import type {
  Application,
  Child,
  ChildTable,
  Store,
  Template,
  PublicStep,
} from "./types";
import {
  defaultPreferences,
  type Preferences,
  type Step,
  type Task,
  type WatchlistItem,
} from "./types";
import { syncDemoStep, isStepDone } from "./workflow";
import { demoData, demoTemplates } from "./demo";
import { initializeUser, isDemo, supabase } from "./supabase";
import { publicPayload } from "./templates";
const key = "shukatsu-demo-v1";
const tableKeys = {
  selection_steps: "steps",
  tasks: "tasks",
  es_questions: "es",
  interview_notes: "interviews",
} as const;
function readDemo(user: string): Store {
  const value = localStorage.getItem(key);
  if (value) return JSON.parse(value) as Store;
  const data = demoData(user);
  writeDemo(data);
  return data;
}
function writeDemo(data: Store) {
  localStorage.setItem(key, JSON.stringify(data));
}
export async function loadStore(): Promise<Store> {
  const user = await initializeUser();
  if (isDemo) return readDemo(user);
  const [applications, steps, tasks, es, interviews, preferences, watchlist] =
    await Promise.all([
      fetchAll<Store["applications"][number]>("user_applications", user),
      fetchAll<Store["steps"][number]>("selection_steps", user),
      fetchAll<Store["tasks"][number]>("tasks", user),
      fetchAll<Store["es"][number]>("es_questions", user),
      fetchAll<Store["interviews"][number]>("interview_notes", user),
      supabase!
        .from("user_preferences")
        .select("auto_create_tasks,auto_calendar")
        .eq("user_id", user)
        .maybeSingle(),
      fetchAll<WatchlistItem>("watchlist", user),
    ]);
  if (preferences.error) throw preferences.error;
  return {
    applications,
    steps,
    tasks,
    es,
    interviews,
    preferences: preferences.data ?? defaultPreferences,
    watchlist,
  };
}
export async function saveApplication(application: Application) {
  const user = await initializeUser();
  const item = { ...application, user_id: user };
  if (isDemo) {
    const d = readDemo(user);
    d.applications = [...d.applications.filter((a) => a.id !== item.id), item];
    writeDemo(d);
    return;
  }
  const { error } = await supabase!.from("user_applications").upsert(item);
  if (error) throw error;
}
export async function removeApplication(id: string) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    d.applications = d.applications.filter((a) => a.id !== id);
    d.steps = d.steps.filter((a) => a.user_application_id !== id);
    d.tasks = d.tasks.filter((a) => a.user_application_id !== id);
    d.es = d.es.filter((a) => a.user_application_id !== id);
    d.interviews = d.interviews.filter((a) => a.user_application_id !== id);
    writeDemo(d);
    return;
  }
  const { error } = await supabase!
    .from("user_applications")
    .delete()
    .eq("id", id)
    .eq("user_id", user);
  if (error) throw error;
}
export async function saveChild(table: ChildTable, item: Child) {
  const user = await initializeUser();
  const owned = { ...item, user_id: user };
  if (table === "selection_steps") {
    const s = owned as Step;
    s.state ??= s.completed ? "完了" : "未着手";
  }
  if (isDemo) {
    const d = readDemo(user);
    const k = tableKeys[table];
    (d[k] as Child[]) = [
      ...(d[k] as Child[]).filter((x) => x.id !== item.id),
      owned,
    ];
    if (table === "selection_steps") {
      const s = owned as Step;
      const old = readDemo(user).steps.find((x) => x.id === s.id);
      if (
        old &&
        old.completed !== s.completed &&
        (old.state ?? (old.completed ? "完了" : "未着手")) === s.state
      )
        s.state = s.completed ? "完了" : "未着手";
      else s.completed = isStepDone(s.state ?? "未着手");
      syncDemoStep(d, s);
    }
    if (table === "tasks") {
      const t = owned as Task;
      const step = d.steps.find((s) => s.id === t.selection_step_id);
      if (step && step.completed !== t.completed) {
        step.completed = t.completed;
        step.state = t.completed ? "完了" : "未着手";
      }
    }
    writeDemo(d);
    return;
  }
  const { error } = await supabase!
    .from(table)
    .upsert(owned as Record<string, unknown>);
  if (error) throw error;
}
export async function removeChild(table: ChildTable, id: string) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    const k = tableKeys[table];
    (d[k] as Child[]) = (d[k] as Child[]).filter((x) => x.id !== id);
    if (table === "selection_steps")
      d.tasks = d.tasks.filter((t) => t.selection_step_id !== id);
    writeDemo(d);
    return;
  }
  const { error } = await supabase!
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", user);
  if (error) throw error;
}
export async function loadTemplates(): Promise<Template[]> {
  await initializeUser();
  if (isDemo)
    return (
      JSON.parse(localStorage.getItem("shukatsu-demo-templates") ?? "null") ??
      demoTemplates()
    );
  const [templates, companies] = await Promise.all([
    fetchAll<Template>("recruitment_templates"),
    fetchAll<{
      id: string;
      industry: string;
      tags: string[];
      aliases: string[];
    }>("companies"),
  ]);
  const masters = new Map(companies.map((c) => [c.id, c]));
  return templates
    .map((t) => ({
      ...t,
      industry: masters.get(t.company_id)?.industry ?? "",
      tags: masters.get(t.company_id)?.tags ?? [],
      aliases: masters.get(t.company_id)?.aliases ?? [],
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function publishTemplate(a: Application, flow: PublicStep[]) {
  const user = await initializeUser();
  const payload = publicPayload(a, flow);
  if (!a.url) throw new Error("公式採用URLを設定してください");
  if (isDemo) {
    const ts = await loadTemplates();
    ts.unshift({
      ...payload,
      source_url: a.url,
      source_type: "user_submitted",
      verification_status: "unverified",
      application_status: "unknown",
      last_verified_at: null,
      id: crypto.randomUUID(),
      company_id: a.company_id ?? crypto.randomUUID(),
      public: true,
      created_by_user_id: user,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem("shukatsu-demo-templates", JSON.stringify(ts));
    return;
  }
  const { error } = await supabase!.rpc("publish_template", { payload });
  if (error) throw error;
}
export async function setTemplatePublic(id: string, value: boolean) {
  if (isDemo) {
    const ts = await loadTemplates();
    localStorage.setItem(
      "shukatsu-demo-templates",
      JSON.stringify(
        ts.map((t) => (t.id === id ? { ...t, public: value } : t)),
      ),
    );
    return;
  }
  const { error } = await supabase!
    .from("recruitment_templates")
    .update({ public: value })
    .eq("id", id);
  if (error) throw error;
}
export async function copyTemplate(t: Template): Promise<string> {
  const user = await initializeUser();
  if (!isDemo) {
    const { data, error } = await supabase!.rpc("copy_template", {
      template_id: t.id,
    });
    if (error) throw error;
    return data as string;
  }
  const id = crypto.randomUUID();
  await saveApplication({
    id,
    user_id: user,
    company_id: t.company_id,
    recruitment_template_id: t.id,
    company_name: t.company_name,
    industry: t.industry ?? "",
    graduation_year: t.graduation_year,
    job_category: t.job_category,
    position_name: t.position_name,
    course_name: "",
    selection_type: t.selection_type,
    application_start: t.application_start,
    application_deadline: t.application_deadline,
    url: t.url,
    location: "",
    priority: "未設定",
    status: "応募予定",
    copied_application_deadline: t.application_deadline,
    last_verified_at: t.last_verified_at ?? null,
    memo: "",
    research: "",
    tags: t.tags ?? [],
    created_at: new Date().toISOString(),
  });
  for (const [i, s] of t.public_flow.entries())
    await saveChild("selection_steps", {
      id: crypto.randomUUID(),
      user_id: user,
      user_application_id: id,
      ...s,
      deadline: null,
      scheduled_at: null,
      completed: false,
      result: "",
      memo: "",
      url: "",
      order_index: i,
    });
  return id;
}
export async function importApplications(items: Application[]) {
  const user = await initializeUser();
  const owned = items.map((x) => ({ ...x, user_id: user }));
  if (isDemo) {
    const d = readDemo(user);
    d.applications.push(...owned);
    writeDemo(d);
    return;
  }
  const { error } = await supabase!.from("user_applications").insert(owned);
  if (error) throw error;
}
export async function issueTransfer(): Promise<string> {
  await initializeUser();
  if (isDemo) throw new Error("引き継ぎはSupabase接続時に利用できます。");
  const { data, error } = await supabase!.rpc("issue_transfer_code");
  if (error) throw error;
  localStorage.setItem("shukatsu-transfer-code", data as string);
  return data as string;
}
export async function redeemTransfer(code: string) {
  await initializeUser();
  if (isDemo)
    throw new Error("デモデータはこのブラウザだけに保存されています。");
  const { data, error } = await supabase!.rpc("redeem_transfer_code", { code });
  if (error) throw error;
  if (!data)
    throw new Error("コードが無効・期限切れ、または試行回数の上限です。");
  localStorage.removeItem("shukatsu-transfer-code");
}

export async function importBundle(bundle: import("./csv").ImportBundle) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    d.applications.push(
      ...bundle.applications.map((a) => ({ ...a, user_id: user })),
    );
    d.steps.push(...bundle.steps.map((a) => ({ ...a, user_id: user })));
    d.tasks.push(...bundle.tasks.map((a) => ({ ...a, user_id: user })));
    writeDemo(d);
    return;
  }
  const { error } = await supabase!.rpc("import_bundle", { payload: bundle });
  if (error) throw error;
}

async function fetchAll<T>(table: string, user?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    let query = supabase!
      .from(table)
      .select("*")
      .order("id")
      .range(start, start + 499);
    if (user) query = query.eq("user_id", user);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as T[]));
    if (data.length < 500) return rows;
  }
}

export async function savePreferences(preferences: Preferences) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    d.preferences = preferences;
    writeDemo(d);
    return;
  }
  const { error } = await supabase!
    .from("user_preferences")
    .upsert({ user_id: user, ...preferences });
  if (error) throw error;
}
export async function toggleWatchlist(templateId: string, watched: boolean) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    d.watchlist = (d.watchlist ?? []).filter(
      (w) => w.recruitment_template_id !== templateId,
    );
    if (watched)
      d.watchlist.push({
        id: crypto.randomUUID(),
        user_id: user,
        recruitment_template_id: templateId,
        created_at: new Date().toISOString(),
      });
    writeDemo(d);
    return;
  }
  const { error } = watched
    ? await supabase!
        .from("watchlist")
        .upsert(
          { user_id: user, recruitment_template_id: templateId },
          {
            onConflict: "user_id,recruitment_template_id",
            ignoreDuplicates: true,
          },
        )
    : await supabase!
        .from("watchlist")
        .delete()
        .eq("user_id", user)
        .eq("recruitment_template_id", templateId);
  if (error) throw error;
}
export async function reportTemplate(
  templateId: string,
  reportType: string,
  comment: string,
) {
  const user = await initializeUser();
  if (isDemo) {
    const key = "shukatsu-demo-reports";
    const reports = JSON.parse(localStorage.getItem(key) ?? "[]");
    localStorage.setItem(
      key,
      JSON.stringify([
        ...reports,
        {
          template_id: templateId,
          user_id: user,
          report_type: reportType,
          comment,
        },
      ]),
    );
    return;
  }
  const { error } = await supabase!
    .from("template_reports")
    .insert({
      template_id: templateId,
      user_id: user,
      report_type: reportType,
      comment,
    });
  if (error) throw error;
}
export async function applyTemplateDeadline(a: Application, t: Template) {
  if (isDemo) {
    await saveApplication({
      ...a,
      application_deadline: t.application_deadline,
      copied_application_deadline: t.application_deadline,
      last_verified_at: t.last_verified_at,
    });
    return;
  }
  const { error } = await supabase!.rpc("apply_template_deadline", {
    application_id: a.id,
    expected_deadline: t.application_deadline,
  });
  if (error) throw error;
}
export async function reorderSteps(applicationId: string, ids: string[]) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    d.steps = d.steps.map((s) =>
      s.user_application_id === applicationId
        ? { ...s, order_index: ids.indexOf(s.id) }
        : s,
    );
    writeDemo(d);
    return;
  }
  const { error } = await supabase!.rpc("reorder_steps", {
    application_id: applicationId,
    step_ids: ids,
  });
  if (error) throw error;
}
export async function setApplicationPriority(
  id: string,
  priority: Application["priority"],
) {
  const user = await initializeUser();
  if (isDemo) {
    const d = readDemo(user);
    const a = d.applications.find((a) => a.id === id);
    if (a) a.priority = priority;
    writeDemo(d);
    return;
  }
  const { error } = await supabase!
    .from("user_applications")
    .update({ priority })
    .eq("id", id)
    .eq("user_id", user);
  if (error) throw error;
}
