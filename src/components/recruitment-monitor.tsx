"use client";
import { useState } from "react";
import Link from "next/link";
import {
  useRecruitmentMonitor,
  monitorRequest,
  monitorPreference,
} from "@/lib/recruitment-client";
import { sourceTypes, fetchErrorLabels } from "@/lib/recruitment";
import type { Application } from "@/lib/types";
import { isDemo } from "@/lib/supabase";
import { Button } from "./ui/button";
import { useAction } from "./providers";
export function UrlRegistration({
  application,
}: {
  application?: Application;
}) {
  const action = useAction(),
    [url, setUrl] = useState(""),
    [kind, setKind] = useState<(typeof sourceTypes)[number]>("recruitment"),
    [queued, setQueued] = useState(false);
  if (isDemo)
    return (
      <p className="muted text-xs">
        URLからの取得はSupabase接続時に利用できます。
      </p>
    );
  return (
    <details className="panel p-4 mb-4">
      <summary className="cursor-pointer font-medium">
        {application ? "採用ページURLを追加" : "URLから登録"}
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="muted text-xs">
          公開ページを解析し、確認待ちの候補を作ります。登録はレビュー後に行います。
        </p>
        <label>
          公開採用URL
          <input
            className="w-full"
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          ページの種類
          <select
            className="w-full"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {sourceTypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={action.busy || !url}
          onClick={() =>
            action.run(async () => {
              const added = await monitorRequest({
                action: "add",
                url,
                company_id: application?.company_id ?? null,
                company_name: application?.company_name ?? "",
                source_type: kind,
              });
              await monitorRequest({
                action: "check",
                source_id: added.source_id,
              });
              setQueued(true);
            }, "取得を受け付けました。結果はレビュー画面で確認できます")
          }
        >
          今すぐ解析
        </Button>
        {queued && (
          <Link className="text-link" href="/templates/updates">
            取得状況・候補を確認する →
          </Link>
        )}
      </div>
    </details>
  );
}
export function CompanyMonitor({ application }: { application: Application }) {
  const { data, error } = useRecruitmentMonitor(),
    action = useAction();
  const sources =
    data?.sources.filter((s) =>
      s.company_id
        ? s.company_id === application.company_id
        : s.company_name === application.company_name,
    ) ?? [];
  return (
    <section className="panel p-4 my-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2>公式採用ページの確認</h2>
        <Link
          className="text-link"
          href={"/templates/updates?application=" + application.id}
        >
          更新候補を確認
        </Link>
      </div>
      <p className="muted text-xs mb-3">
        変更があった公開ページだけを解析します。募集情報の反映には確認が必要です。
      </p>
      {error && (
        <p role="alert" className="field-error text-xs">
          自動取得の設定を確認してください：{error.message}
        </p>
      )}
      {sources.map((s) => {
        const setting = data?.settings.find((p) => p.source_id === s.id);
        return (
          <div key={s.id} className="border-t border-border py-3 grid gap-2">
            <a
              className="text-link break-all text-sm"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.url} ↗
            </a>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={setting?.monitor_enabled ?? true}
                  disabled={action.busy}
                  onChange={(e) =>
                    action.run(() =>
                      monitorPreference(
                        { monitor_enabled: e.target.checked },
                        s.id,
                      ),
                    )
                  }
                />{" "}
                自分の監視
              </label>
              <select
                aria-label="確認頻度"
                value={setting?.monitor_priority ?? s.monitor_priority}
                disabled={action.busy}
                onChange={(e) =>
                  action.run(() =>
                    monitorPreference(
                      { monitor_priority: e.target.value },
                      s.id,
                    ),
                  )
                }
              >
                <option value="high">毎日</option>
                <option value="medium">週2回</option>
                <option value="low">週1回</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () => monitorRequest({ action: "check", source_id: s.id }),
                    "取得を受け付けました",
                  )
                }
              >
                最新情報を取得
              </Button>
            </div>
            <p className="muted text-xs">
              {s.last_checked_at
                ? new Date(s.last_checked_at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })
                : "未取得"}{" "}
              ·{" "}
              {fetchErrorLabels[s.last_error ?? s.last_result ?? ""] ??
                "確認待ち"}
            </p>
          </div>
        );
      })}
      <UrlRegistration application={application} />
    </section>
  );
}
export function RecruitmentNotice() {
  const { data } = useRecruitmentMonitor();
  if (
    !data ||
    data.preferences?.notifications === false ||
    !data.candidates.length
  )
    return null;
  return (
    <Link href="/templates/updates" className="panel p-4 mb-5 block">
      <strong>募集情報の更新 {data.candidates.length}件</strong>
      <p className="muted text-sm mt-1">
        {data.candidates.some((c) => c.important_update)
          ? "締切・募集状況の重要な変更候補があります。"
          : "新しい募集情報の候補があります。"}{" "}
        確認する →
      </p>
    </Link>
  );
}
export function MonitorSettings() {
  const { data, error } = useRecruitmentMonitor(),
    action = useAction();
  return (
    <section className="panel p-5">
      <h2 className="mb-3">募集情報自動更新</h2>
      <p className="muted text-sm mb-3">
        ルール解析はAPI料金不要です。Geminiは任意の補助で、未設定でも取得・差分検知が動作します。
      </p>
      {isDemo ? (
        <p className="muted text-sm">デモでは外部取得を実行しません。</p>
      ) : error ? (
        <p role="alert" className="field-error">
          {error.message}
        </p>
      ) : !data ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <p className="text-sm">
            Gemini API：{data.geminiConfigured ? "設定済" : "未設定"} ·{" "}
            {data.aiEnabled ? "AI補助を利用可能" : "AI補助なし"}
          </p>
          {!data.workerConfigured && (
            <p className="field-error text-sm">
              サーバー用Supabaseキーの設定が必要です。READMEをご確認ください。
            </p>
          )}
          <p className="text-sm my-3">
            監視URL {data.sources.length}件 · 更新候補 {data.candidates.length}
            件
          </p>
          <p className="text-sm mb-3">
            今月の解析：ルール {data.jobs.reduce((n, j) => n + j.rule_count, 0)}
            回 / AI {data.jobs.reduce((n, j) => n + j.ai_count, 0)}
            回（閲覧できる取得履歴の集計）
          </p>
          {(
            [
              ["auto_check", "自分の登録URLを自動チェック"],
              ["ai_enabled", "低信頼の結果にGemini補助を使う"],
              ["notifications", "更新候補をホームに表示"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm my-3">
              <input
                type="checkbox"
                disabled={
                  action.busy ||
                  (key === "ai_enabled" &&
                    (!data.geminiConfigured || !data.aiEnabled))
                }
                checked={data.preferences?.[key] ?? key !== "ai_enabled"}
                onChange={(e) =>
                  action.run(() =>
                    monitorPreference({ [key]: e.target.checked }),
                  )
                }
              />
              {label}
            </label>
          ))}
          <p className="muted text-xs mb-3">
            共有の公式URLは全体設定で監視されます。頻度は企業詳細で変更できます。
          </p>
          <Link className="text-link" href="/templates/updates">
            取得状況・変更候補を見る →
          </Link>
        </>
      )}
    </section>
  );
}
