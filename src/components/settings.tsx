"use client";
import { ImportSettings } from "./import-settings";
import { MonitorSettings } from "./recruitment-monitor";
import { useSyncExternalStore, useState } from "react";
import { useTheme } from "next-themes";
import {
  Download,
  Upload,
  KeyRound,
  Copy,
  Bell,
  ShieldCheck,
  Monitor,
  Database,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useStore, useAction } from "./providers";
import {
  issueTransfer,
  redeemTransfer,
  importBundle,
  savePreferences,
} from "@/lib/repository";
import {
  isDemo,
  isConfigured,
  initializeUser,
  configurationError,
} from "@/lib/supabase";
import {
  parseCsv,
  parseCsvFiles,
  exportCsvFiles,
  exportCsv,
  downloadFile,
  type ImportBundle,
} from "@/lib/csv";
import { defaultPreferences } from "@/lib/types";
import { todayKey, eventsFromStore, reminders } from "@/lib/dates";
import { PageHeading } from "./shared";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
const subscribeMounted = () => () => {};
export function Settings() {
  const { data } = useStore();
  const action = useAction();
  const q = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [codeOverride, setCode] = useState<string>();
  const [incoming, setIncoming] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<ImportBundle>();
  const [permissionOverride, setPermission] = useState<string>();
  const [importError, setImportError] = useState("");
  const mounted = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );
  const code =
    codeOverride ??
    (mounted ? (localStorage.getItem("shukatsu-transfer-code") ?? "") : "");
  const permission =
    permissionOverride ??
    (mounted && "Notification" in window ? Notification.permission : "default");
  async function notify() {
    if (!("Notification" in window)) {
      toast.error("このブラウザは通知に対応していません。");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted" && data) {
      const upcoming = reminders(eventsFromStore(data));
      new Notification("しゅうかつ手帳", {
        body: upcoming.length
          ? upcoming
              .slice(0, 3)
              .map((e) => e.title)
              .join("\n")
          : "直近の通知はありません。",
        icon: "/icon.svg",
      });
    }
  }
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    if (files.length === 1 && files[0].name !== "applications.csv") {
      await upload(files[0]);
      return;
    }
    setImportError("");
    if (Array.from(files).reduce((n, f) => n + f.size, 0) > 5 * 1024 * 1024) {
      setImportError("CSV合計は5MB以下にしてください。");
      return;
    }
    try {
      const contents = Object.fromEntries(
        await Promise.all(
          Array.from(files).map(async (f) => [f.name, await f.text()]),
        ),
      );
      setPreview(parseCsvFiles(contents, await initializeUser()));
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "CSVを読み込めませんでした",
      );
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setImportError("");
    if (file.size > 5 * 1024 * 1024) {
      setImportError("CSVは5MB以下にしてください。");
      return;
    }
    try {
      setPreview(parseCsv(await file.text(), await initializeUser()));
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "CSVを読み込めませんでした",
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="設定・データ管理"
        description="大切な記録を、安全に持ち歩こう。"
      />
      <div className="settings-grid">
        <ImportSettings />
        <MonitorSettings />
        <section className="panel settings-panel">
          <h2>選考の自動連携</h2>
          <p>
            新規・編集した選考ステップを連携します。OFFにしても既存タスクは保持されます。
          </p>
          {(
            [
              ["auto_create_tasks", "選考ステップからタスクを自動作成"],
              ["auto_calendar", "選考ステップをカレンダーへ自動追加"],
            ] as const
          ).map(([key, label]) => (
            <label className="inline-check my-4" key={key}>
              <input
                type="checkbox"
                disabled={!data || action.busy}
                checked={(data?.preferences ?? defaultPreferences)[key]}
                onChange={(e) =>
                  action.run(() =>
                    savePreferences({
                      ...(data?.preferences ?? defaultPreferences),
                      [key]: e.target.checked,
                    }),
                  )
                }
              />
              {label}
            </label>
          ))}
        </section>
        <section className="panel settings-panel">
          <h2>
            <ShieldCheck size={19} />
            あなたのデータ
          </h2>
          <p>
            アカウント登録は不要です。このブラウザの匿名セッションで、あなただけのデータを管理しています。
          </p>
          <div className="privacy-callout">
            このブラウザを削除するとデータへアクセスできなくなる可能性があります。引き継ぎコードを安全な場所に保管してください。
          </div>
          <dl className="detail-dl">
            <div>
              <dt>保存先</dt>
              <dd>
                {isDemo
                  ? "このブラウザ（デモ）"
                  : isConfigured
                    ? "Supabase"
                    : "未設定"}
              </dd>
            </div>
            <div>
              <dt>プライバシー</dt>
              <dd>個人メモ・ES・面接記録は非公開</dd>
            </div>
          </dl>
          {!isDemo && !isConfigured && (
            <p className="field-error">{configurationError}</p>
          )}
        </section>
        <section className="panel settings-panel">
          <h2>
            <Monitor size={19} />
            表示と通知
          </h2>
          <label>
            テーマ
            <select
              aria-label="テーマ"
              disabled={!mounted}
              value={mounted ? theme : "light"}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
              <option value="system">システムに合わせる</option>
            </select>
          </label>
          <div className="mt-6">
            <h3 className="text-sm font-semibold">ブラウザ通知</h3>
            <p>
              7日前・3日前・前日・当日の予定はアプリ内通知で確認できます。ブラウザ通知は、ボタンを押したときに直近の予定をお知らせします。
            </p>
            <Button variant="outline" onClick={notify}>
              <Bell size={15} />
              {permission === "granted"
                ? "現在の予定を通知する"
                : "ブラウザ通知を有効にする"}
            </Button>
            <small className="block muted mt-3">
              アプリを閉じている間の自動プッシュ通知には対応していません。
            </small>
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>
            <KeyRound size={19} />
            引き継ぎコード
          </h2>
          <p>
            有効期限は発行から30日間、1回のみ使えます。新しく発行すると以前のコードは無効になります。コードを知っている人はデータを移行できるため、公開しないでください。
          </p>
          {code && (
            <div className="transfer-code">
              <code>{code}</code>
              <button
                className="icon-button"
                aria-label="引き継ぎコードをコピー"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    toast.success("コピーしました");
                  } catch {
                    toast.error("コードを選択してコピーしてください");
                  }
                }}
              >
                <Copy size={17} />
              </button>
            </div>
          )}
          <Button
            disabled={isDemo || !isConfigured || action.busy}
            variant="outline"
            onClick={() =>
              action.run(
                async () => setCode(await issueTransfer()),
                "コードを発行しました",
              )
            }
          >
            <KeyRound size={15} />
            {code ? "コードを再発行" : "コードを発行する"}
          </Button>
          {isDemo && (
            <small className="block muted mt-3">
              デモモードでは引き継ぎできません。
            </small>
          )}
        </section>
        <section className="panel settings-panel">
          <h2>
            <Smartphone size={19} />
            別のブラウザから引き継ぐ
          </h2>
          <p>
            元のブラウザで発行したコードを入力してください。元のデータがこのブラウザへ移動し、既存の企業と一緒に表示されます。移動後は元のブラウザから参照できません。
          </p>
          <label>
            引き継ぎコード
            <input
              autoComplete="off"
              spellCheck={false}
              value={incoming}
              onChange={(e) => setIncoming(e.target.value.trim())}
              placeholder="64文字のコード"
              maxLength={64}
            />
          </label>
          <Button
            className="mt-4"
            disabled={
              isDemo || !isConfigured || incoming.length !== 64 || action.busy
            }
            onClick={() => setRestoring(true)}
          >
            データを引き継ぐ
          </Button>
        </section>
        <section className="panel settings-panel span-2">
          <h2>
            <Database size={19} />
            データをエクスポート・インポート
          </h2>
          <p>
            企業・募集・選考フロー・タスクをCSVでバックアップできます。CSVには個人メモや選考結果が含まれます。ES・面接記録・企業研究ノートを含む完全な移行には、引き継ぎコードを利用してください。
          </p>
          <p className="text-xs muted">
            分割CSVは各ボタンから保存できます。復元時は3ファイルをまとめて選択してください。
          </p>
          <div className="flex gap-2 flex-wrap mb-4">
            {["applications.csv", "tasks.csv", "selection_steps.csv"].map(
              (name) => (
                <Button
                  key={name}
                  size="sm"
                  variant="outline"
                  disabled={!data}
                  onClick={() =>
                    data && downloadFile(exportCsvFiles(data)[name], name)
                  }
                >
                  <Download size={14} />
                  {name}
                </Button>
              ),
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              disabled={!data}
              onClick={() =>
                data &&
                downloadFile(exportCsv(data), `shukatsu-${todayKey()}.csv`)
              }
            >
              <Download size={15} />
              CSVをエクスポート
            </Button>
            <label className="btn btn-outline cursor-pointer">
              <Upload size={15} />
              CSVをインポート
              <input
                className="sr-only"
                aria-label="CSVファイルを選択"
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={(e) => {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                downloadFile(
                  "company_name,industry,graduation_year,job_category,position_name,course_name,selection_type,application_start,application_deadline,url,location,priority,status,memo,tags,selection_steps,tasks\nサンプル企業,IT,2028,ビジネス職,2028卒,,本選考,,,,東京,B,検討中,,,[],[]\n",
                  "template.csv",
                )
              }
            >
              入力テンプレートを取得
            </Button>
          </div>
          {importError && (
            <p className="field-error mt-3 break-all" role="alert">
              {importError}
            </p>
          )}
          <p className="muted text-xs">
            UTF-8 /
            最大5MB・500社。インポートは新規追加です。同じファイルを再度取り込むと重複します。
          </p>
        </section>
      </div>
      <Dialog
        open={restoring}
        onOpenChange={setRestoring}
        title="データをこのブラウザに移動"
        description="元のブラウザは移行したデータにアクセスできなくなります。コードは使い捨てです。"
      >
        <div className="form-footer">
          <Button variant="outline" onClick={() => setRestoring(false)}>
            キャンセル
          </Button>
          <Button
            disabled={action.busy}
            onClick={async () => {
              if (
                await action.run(
                  () => redeemTransfer(incoming),
                  "データを引き継ぎました",
                )
              ) {
                setRestoring(false);
                setIncoming("");
                setCode("");
                await q.invalidateQueries();
              }
            }}
          >
            引き継ぎを実行
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(undefined)}
        title="CSVを取り込む"
        description={`${preview?.applications.length ?? 0}社・選考${preview?.steps.length ?? 0}件・タスク${preview?.tasks.length ?? 0}件を新規追加します。`}
      >
        <div className="import-preview">
          {preview?.applications.slice(0, 10).map((a) => (
            <p key={a.id}>
              {a.company_name} · {a.graduation_year}卒 · {a.job_category}
            </p>
          ))}
          {(preview?.applications.length ?? 0) > 10 && (
            <p>ほか {(preview?.applications.length ?? 0) - 10}社</p>
          )}
        </div>
        <div className="form-footer">
          <Button variant="outline" onClick={() => setPreview(undefined)}>
            キャンセル
          </Button>
          <Button
            disabled={action.busy}
            onClick={async () => {
              if (
                preview &&
                (await action.run(
                  () => importBundle(preview),
                  "CSVを取り込みました",
                ))
              )
                setPreview(undefined);
            }}
          >
            インポートする
          </Button>
        </div>
      </Dialog>
    </>
  );
}
