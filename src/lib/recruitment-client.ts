"use client";
import { useQuery } from "@tanstack/react-query";
import { initializeUser, isDemo, supabase } from "./supabase";
import type { CompanySource, RecruitmentCandidate } from "./recruitment";
export interface MonitorData {
  userId: string;
  sources: CompanySource[];
  candidates: RecruitmentCandidate[];
  settings: {
    source_id: string;
    monitor_enabled: boolean;
    monitor_priority: string;
  }[];
  preferences: {
    auto_check: boolean;
    ai_enabled: boolean;
    notifications: boolean;
  } | null;
  canReviewPublic: boolean;
  geminiConfigured: boolean;
  aiEnabled: boolean;
  workerConfigured: boolean;
  jobs: {
    id: string;
    source_id: string;
    status: string;
    result: string | null;
    rule_count: number;
    ai_count: number;
    created_at: string;
  }[];
}
export async function monitorRequest(command?: Record<string, unknown>) {
  await initializeUser();
  if (!supabase) throw new Error("自動取得はSupabase接続時に利用できます");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch("/api/recruitment-monitor", {
    method: command ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + session?.access_token,
      "Content-Type": "application/json",
    },
    ...(command ? { body: JSON.stringify(command) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "接続できませんでした");
  return result;
}
export function useRecruitmentMonitor() {
  return useQuery<MonitorData>({
    queryKey: ["recruitment-monitor"],
    queryFn: () => monitorRequest(),
    enabled: !isDemo,
    refetchInterval: 15000,
    retry: 0,
  });
}
export async function monitorPreference(
  values: Record<string, unknown>,
  sourceId?: string,
) {
  const user = await initializeUser();
  if (!supabase) throw new Error("Supabase接続が必要です");
  const { error } = await supabase
    .from(
      sourceId ? "company_source_settings" : "recruitment_monitor_preferences",
    )
    .upsert({
      user_id: user,
      ...(sourceId ? { source_id: sourceId } : {}),
      ...values,
    });
  if (error) throw error;
}
export async function reviewRecruitment(values: Record<string, unknown>) {
  await initializeUser();
  if (!supabase) throw new Error("Supabase接続が必要です");
  const { reject, ...input } = values;
  const { data, error } = await supabase.rpc("review_recruitment_candidate", {
    ...input,
    reject_candidate: reject,
  });
  if (error) throw error;
  return data as string | null;
}
