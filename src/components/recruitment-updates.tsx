"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useRecruitmentMonitor,
  monitorRequest,
  reviewRecruitment,
} from "@/lib/recruitment-client";
import {
  confidenceLabel,
  fetchErrorLabels,
  type RecruitmentCandidate,
  type ReviewField,
} from "@/lib/recruitment";
import { useAction, useStore, useTemplates } from "./providers";
import { PageHeading } from "./shared";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { isDemo } from "@/lib/supabase";
const labels: Record<ReviewField, string> = {
  position_name: "募集名",
  job_category: "職種",
  selection_type: "募集区分",
  application_status: "募集状況",
  deadline_type: "締切方式",
  application_start: "応募開始",
  application_deadline: "応募締切",
  event_start: "開催開始",
  event_end: "開催終了",
  source_url: "公式URL",
  selection_steps: "選考フロー",
  eligibility: "応募資格",
  notes: "公開情報の注記",
};
const pretty = (v: unknown): string =>
  v === null || v === undefined
    ? "未設定"
    : Array.isArray(v)
      ? v
          .map((s) =>
            typeof s === "object" && s
              ? (s.title ?? "") + " " + (s.deadline ?? s.scheduled_at ?? "")
              : String(s),
          )
          .join(" → ")
      : String(v);
function CandidateCard({
  candidate: c,
  canReviewPublic,
  initialApplication,
  userId,
}: {
  userId: string;
  candidate: RecruitmentCandidate;
  canReviewPublic: boolean;
  initialApplication: string | null;
}) {
  const { data: store } = useStore(),
    { data: templates } = useTemplates(),
    action = useAction();
  const keys = Object.keys(c.diff_json) as ReviewField[];
  const [selected, setSelected] = useState<ReviewField[]>(keys),
    [confirm, setConfirm] = useState(false),
    [calendar, setCalendar] = useState(true),
    [tasks, setTasks] = useState(false);
  const [scope, setScope] = useState("personal"),
    [company, setCompany] = useState(c.raw_extracted_json.company_name ?? ""),
    [year, setYear] = useState(
      c.raw_extracted_json.graduation_year?.toString() ?? "",
    );
  const eligible =
    store?.applications.filter(
      (a) =>
        (c.company_id
          ? a.company_id === c.company_id
          : a.company_name === company) &&
        (!c.raw_extracted_json.graduation_year ||
          a.graduation_year === c.raw_extracted_json.graduation_year),
    ) ?? [];
  const [application, setApplication] = useState(initialApplication ?? "");
  const template = templates?.find((t) => t.id === c.template_id);
  const mine = userId;
  const canPublish =
    canReviewPublic ||
    (!!mine &&
      (template?.created_by_user_id === mine ||
        (!c.template_id && c.owner_user_id === mine)));
  async function submit(reject = false) {
    const ok = await action.run(
      () =>
        reviewRecruitment({
          candidate: c.id,
          fields: selected,
          scope,
          target_application: eligible.some((a) => a.id === application)
            ? application
            : null,
          add_calendar: calendar,
          add_tasks: tasks,
          confirmed_company: company || null,
          confirmed_year: year ? Number(year) : null,
          reject,
        }),
      reject ? "候補を非表示にしました" : "確認した項目を反映しました",
    );
    if (ok) setConfirm(false);
  }
  return (
    <article className="panel p-5 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2>
            {c.raw_extracted_json.company_name || "企業名を確認してください"}
          </h2>
          <p className="text-sm mt-1">
            {c.raw_extracted_json.graduation_year
              ? c.raw_extracted_json.graduation_year + "卒"
              : "卒年度未確認"}{" "}
            · {c.raw_extracted_json.position_name || "募集名未確認"}
          </p>
        </div>
        {c.important_update && <span className="tag">重要な変更</span>}
      </div>
      <p className="muted text-xs mt-3">
        解析：{c.parser_type === "rule" ? "ルールベース" : "ルール + AI補助"} ·{" "}
        {confidenceLabel(c.confidence)} confidence (
        {Math.round(c.confidence * 100)}%) ·{" "}
        {new Date(c.created_at).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        })}
      </p>
      <a
        className="text-link text-sm my-3 inline-block"
        href={c.source_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        公式ページを開く ↗
      </a>
      {c.raw_extracted_json.warnings.map((w, i) => (
        <p key={i} className="muted text-xs mb-2">
          {w}
        </p>
      ))}
      <div className="grid gap-3">
        {keys.map((key) => {
          const d = c.diff_json[key]!;
          return (
            <div key={key} className="border-t border-border pt-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, key]
                        : s.filter((k) => k !== key),
                    )
                  }
                />
                {labels[key]}
              </label>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mt-2">
                <div className="muted break-words">
                  変更前：{pretty(d.before)}
                </div>
                <div className="break-words">変更後：{pretty(d.after)}</div>
              </div>
              {d.evidence && (
                <blockquote className="muted text-xs mt-2 border-l-2 border-border pl-3 whitespace-pre-wrap">
                  {d.evidence.evidence_text}
                  <span className="block mt-1">
                    {d.evidence.source_page_title}
                  </span>
                </blockquote>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        <Button
          disabled={!selected.length || action.busy}
          onClick={() => setConfirm(true)}
        >
          選択した{selected.length}項目を反映
        </Button>
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() => {
            setSelected(keys);
            setConfirm(true);
          }}
        >
          全て反映
        </Button>
        <Button
          variant="ghost"
          disabled={action.busy}
          onClick={() => submit(true)}
        >
          却下
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="確認した募集情報を反映"
        description="公式ページと証拠を確認してください。選択した項目だけを反映します。"
      >
        <div className="grid gap-4">
          <label>
            反映先
            <select
              className="w-full"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="personal">自分の応募データ</option>
              {canPublish && <option value="public">公開テンプレート</option>}
            </select>
          </label>
          {!c.company_id && (
            <label>
              企業名（確認必須）
              <input
                className="w-full"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
          )}
          {!c.raw_extracted_json.graduation_year && (
            <label>
              卒年度（公式ページで確認）
              <input
                className="w-full"
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
          )}
          <label>
            自分の応募先
            <select
              className="w-full"
              value={
                eligible.some((a) => a.id === application) ? application : ""
              }
              onChange={(e) => setApplication(e.target.value)}
            >
              <option value="">応募予定として新規登録</option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.position_name || a.job_category || a.company_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={calendar}
              onChange={(e) => setCalendar(e.target.checked)}
            />
            日程をカレンダーへ追加しますか？
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={tasks}
              onChange={(e) => setTasks(e.target.checked)}
            />
            承認した選考フローからタスクを作成する
          </label>
          <p className="muted text-xs">
            公開テンプレートを更新しても、他の人の応募データは変更されません。カレンダー・タスクを選ぶと自分の応募先にも取り込みます。
          </p>
          <Button
            disabled={
              action.busy || (!c.company_id && !company.trim()) || !year
            }
            onClick={() => submit()}
          >
            確認して反映
          </Button>
        </div>
      </Dialog>
    </article>
  );
}
export function RecruitmentUpdates() {
  const { data, error, isPending, refetch } = useRecruitmentMonitor(),
    action = useAction(),
    search = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="RECRUITMENT UPDATES"
        title="募集情報の更新"
        description="取得 → 差分確認 → 選んだ項目を反映。日付が不明な場合は推測しません。"
      >
        <Button
          variant="outline"
          disabled={action.busy || isDemo}
          onClick={() =>
            action.run(async () => {
              const r = await monitorRequest({ action: "batch" });
              if (!r.queued)
                throw new Error(
                  "対象がないか、既にチェック中・直近に取得済みです",
                );
            }, "一括チェックを受け付けました")
          }
        >
          全企業をチェック
        </Button>
        <Button variant="outline" onClick={() => refetch()}>
          再読み込み
        </Button>
      </PageHeading>
      <Link href="/templates" className="text-link mb-4 inline-block">
        ← みんなの募集
      </Link>
      {error && (
        <p role="alert" className="field-error mb-4">
          {error.message}
        </p>
      )}
      {isDemo ? (
        <p className="panel p-5">
          デモでは自動取得を実行しません。Supabase接続後に利用できます。
        </p>
      ) : isPending ? (
        <p>読み込み中…</p>
      ) : null}
      {data && (
        <details className="panel p-4 mb-5">
          <summary>取得状況 · {data.sources.length} URL</summary>
          <div className="grid gap-2 mt-3">
            {data.sources.map((s) => {
              const job = data.jobs.find((j) => j.source_id === s.id);
              return (
                <p className="text-sm" key={s.id}>
                  {s.company_name || s.url}：
                  {job?.status === "queued"
                    ? "順番待ち"
                    : job?.status === "running"
                      ? "取得中"
                      : (fetchErrorLabels[
                          s.last_error ?? s.last_result ?? ""
                        ] ?? "未取得")}
                </p>
              );
            })}
          </div>
        </details>
      )}
      {data?.candidates.map((c) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          userId={data.userId}
          canReviewPublic={data.canReviewPublic}
          initialApplication={search.get("application")}
        />
      ))}
      {data && !data.candidates.length && (
        <p className="panel p-5 muted">確認待ちの候補はありません。</p>
      )}
    </>
  );
}
