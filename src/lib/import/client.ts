"use client";
import { useQuery } from "@tanstack/react-query";
import { initializeUser, isDemo, supabase } from "../supabase";
import { loadStore } from "../repository";
import {
  type InboxItem,
  type PageExtractionResult,
  type ReviewImport,
  sourceRank,
  itemEventType,
  taskTitle,
} from "./schema";
import { sanitizeExtraction } from "./parser";
import { type UserProfile, emptyProfile, estimatedMinutes } from "./planner";
import type { Application, Store, Task, ImportedEvent } from "../types";
const demoKey = "shukatsu-demo-inbox-v2";
const readDemo = (): InboxItem[] =>
  JSON.parse(localStorage.getItem(demoKey) ?? "[]");
export async function privateRequest(path: string, body?: unknown) {
  await initializeUser();
  if (!supabase) throw new Error("この機能はSupabase接続後に利用できます");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + session?.access_token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "接続に失敗しました");
  return result;
}
export async function loadInbox(): Promise<InboxItem[]> {
  const user = await initializeUser();
  if (isDemo) return readDemo();
  const { data, error } = await supabase!
    .from("import_inbox")
    .select("*")
    .eq("user_id", user)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data;
}
export const useInbox = () =>
  useQuery({
    queryKey: ["import-inbox"],
    queryFn: loadInbox,
    refetchInterval: isDemo ? false : 15000,
  });
export async function addTextImport(input: PageExtractionResult) {
  const user = await initializeUser(),
    extraction = sanitizeExtraction(input);
  if (!isDemo)
    return privateRequest("/api/import/manage", {
      action: "import",
      source: "text",
      extraction,
    });
  const items = readDemo();
  const previous = items.find(
    (i) =>
      i.raw_extracted_json.pageUrl === extraction.pageUrl &&
      i.raw_extracted_json.companyName === extraction.companyName,
  );
  if (
    previous &&
    JSON.stringify(previous.raw_extracted_json) === JSON.stringify(extraction)
  )
    return { id: previous.id };
  const row: InboxItem = {
    id: crypto.randomUUID(),
    user_id: user,
    source_id: previous?.source_id ?? crypto.randomUUID(),
    source_type: "text",
    raw_extracted_json: extraction,
    previous_json: previous?.raw_extracted_json ?? null,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(demoKey, JSON.stringify([row, ...items]));
  return { id: row.id };
}
export async function reviewImport(payload: ReviewImport) {
  await initializeUser();
  if (!isDemo) {
    const { data, error } = await supabase!.rpc("review_private_import", {
      payload,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  const inbox = readDemo(),
    item = inbox.find((i) => i.id === payload.inbox_id);
  if (!item || item.status !== "pending") throw new Error("確認済みの候補です");
  if (payload.reject) {
    item.status = "rejected";
    localStorage.setItem(demoKey, JSON.stringify(inbox));
    return null;
  }
  const store: Store = structuredClone(await loadStore()),
    p = item.raw_extracted_json;
  let app = store.applications.find((a) => a.id === payload.application_id);
  if (!app) {
    if (!payload.fields.includes("company"))
      throw new Error("企業情報を確認してください");
    app = {
      id: crypto.randomUUID(),
      user_id: item.user_id,
      company_id: null,
      recruitment_template_id: null,
      company_name: payload.company_name,
      industry: "",
      graduation_year: payload.graduation_year,
      job_category: "",
      position_name: "",
      course_name: "",
      selection_type: "未発表",
      application_start: null,
      application_deadline: null,
      url: p.pageUrl,
      location: "",
      priority: "未設定",
      status: "応募予定",
      memo: "",
      research: "",
      tags: [],
      created_at: new Date().toISOString(),
    } satisfies Application;
    store.applications.push(app);
  }
  if (payload.fields.includes("company"))
    app.company_name = payload.company_name;
  if (payload.fields.includes("recruitment")) {
    app.position_name = p.recruitmentName ?? app.position_name;
    app.job_category = p.positionName ?? app.job_category;
    app.selection_type = p.recruitmentType;
  }
  store.importedEvents ??= [];
  for (const x of [
    ...p.deadlines,
    ...p.events,
    ...(payload.fields.includes("flow") ? p.detectedSelectionSteps : []),
  ]) {
    if (!payload.item_keys.includes(x.key)) continue;
    const key =
      x.type + ":" + (x.date ?? x.title.toLowerCase().replace(/\s/g, ""));
    const origin = {
      source_type: item.source_type,
      source_id: item.source_id,
      evidence: x.evidence,
      lastUpdated: new Date().toISOString(),
      userEdited: false,
    };
    if (x.type === "APPLICATION_DEADLINE" && x.date) {
      const old = app.field_provenance?.application_deadline_value;
      if (
        old &&
        (old.userEdited ||
          sourceRank[old.source_type as keyof typeof sourceRank] >
            sourceRank[item.source_type]) &&
        !payload.allow_override
      )
        throw new Error(
          "手動編集した締切があります。上書きを確認してください。",
        );
      app.application_deadline = x.date.slice(0, 10);
      app.application_deadline_value = x.date;
      app.calendar_exclusions = [
        ...(app.calendar_exclusions ?? []).filter(
          (v) => v !== "application_deadline",
        ),
        "application_deadline",
      ];
      app.field_provenance = {
        ...app.field_provenance,
        application_deadline_value: origin,
      };
    }
    if (x.key.startsWith("flow-")) {
      if (
        !store.steps.some(
          (s) =>
            s.user_application_id === app!.id &&
            s.import_key === "flow:" + x.title,
        )
      )
        store.steps.push({
          id: crypto.randomUUID(),
          user_id: item.user_id,
          user_application_id: app.id,
          title: x.title,
          step_type: itemEventType[x.type] as never,
          order_index: store.steps.filter(
            (s) => s.user_application_id === app!.id,
          ).length,
          deadline: null,
          scheduled_at: null,
          completed: false,
          result: "",
          memo: "",
          url: "",
          calendar_enabled: false,
          import_key: "flow:" + x.title,
        });
      continue;
    }
    if (payload.calendar && x.date) {
      const old = store.importedEvents.find(
        (e) => e.user_application_id === app!.id && e.import_key === key,
      );
      const event: ImportedEvent = {
        id: old?.id ?? crypto.randomUUID(),
        user_id: item.user_id,
        user_application_id: app.id,
        title: x.title,
        event_type: itemEventType[x.type] as never,
        start_value: x.date,
        end_value: x.end,
        completed: false,
        import_key: key,
        field_provenance: { start_value: origin },
      };
      if (
        old &&
        Object.values(old.field_provenance).some((p) => p.userEdited) &&
        !payload.allow_override
      )
        throw new Error("手動編集した予定があります");
      store.importedEvents = [
        ...store.importedEvents.filter((e) => e.id !== event.id),
        event,
      ];
    }
    if (
      payload.tasks &&
      !store.tasks.some(
        (t) => t.user_application_id === app!.id && t.import_key === key,
      )
    ) {
      const task: Task = {
        id: crypto.randomUUID(),
        user_id: item.user_id,
        user_application_id: app.id,
        title: taskTitle[x.type],
        task_type: itemEventType[x.type],
        due_date: x.date?.slice(0, 10) ?? null,
        due_value: x.date,
        completed: false,
        memo: "",
        url: "",
        import_key: key,
        calendar_enabled: false,
        field_provenance: { due_value: origin },
      };
      task.estimated_minutes = estimatedMinutes(task);
      store.tasks.push(task);
    }
  }
  item.status = "approved";
  localStorage.setItem("shukatsu-demo-v1", JSON.stringify(store));
  localStorage.setItem(demoKey, JSON.stringify(inbox));
  return app.id;
}
export async function loadProfile(): Promise<UserProfile> {
  const user = await initializeUser();
  if (isDemo)
    return JSON.parse(
      localStorage.getItem("shukatsu-demo-profile") ??
        JSON.stringify(emptyProfile),
    );
  const { data, error } = await supabase!
    .from("user_profiles")
    .select("skills,experiences,interests")
    .eq("user_id", user)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? emptyProfile;
}
export async function saveProfile(profile: UserProfile) {
  const user = await initializeUser();
  if (isDemo) {
    localStorage.setItem("shukatsu-demo-profile", JSON.stringify(profile));
    return;
  }
  const { error } = await supabase!
    .from("user_profiles")
    .upsert({ user_id: user, ...profile });
  if (error) throw new Error(error.message);
}
