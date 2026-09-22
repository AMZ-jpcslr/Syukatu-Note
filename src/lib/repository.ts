import type {
  Application,
  Child,
  ChildTable,
  Store,
  Template,
  PublicStep,
} from "./types";
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
  const [applications, steps, tasks, es, interviews] = await Promise.all([
    fetchAll<Store["applications"][number]>("user_applications", user),
    fetchAll<Store["steps"][number]>("selection_steps", user),
    fetchAll<Store["tasks"][number]>("tasks", user),
    fetchAll<Store["es"][number]>("es_questions", user),
    fetchAll<Store["interviews"][number]>("interview_notes", user),
  ]);
  return { applications, steps, tasks, es, interviews };
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
  if (isDemo) {
    const d = readDemo(user);
    const k = tableKeys[table];
    (d[k] as Child[]) = [
      ...(d[k] as Child[]).filter((x) => x.id !== item.id),
      owned,
    ];
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
  return (await fetchAll<Template>("recruitment_templates")).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
export async function publishTemplate(a: Application, flow: PublicStep[]) {
  const user = await initializeUser();
  const payload = publicPayload(a, flow);
  if (isDemo) {
    const ts = await loadTemplates();
    ts.unshift({
      ...payload,
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
    industry: "",
    graduation_year: t.graduation_year,
    job_category: t.job_category,
    position_name: t.position_name,
    course_name: "",
    selection_type: t.selection_type,
    application_start: t.application_start,
    application_deadline: t.application_deadline,
    url: t.url,
    location: "",
    priority: "B",
    status: "検討中",
    memo: "",
    research: "",
    tags: [],
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
