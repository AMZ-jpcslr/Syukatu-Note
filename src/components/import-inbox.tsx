"use client";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "./providers";
import { Button } from "./ui/button";
import { PageHeading } from "./shared";
import { isDemo } from "@/lib/supabase";
import { parsePage } from "@/lib/import/parser";
import {
  useInbox,
  addTextImport,
  reviewImport,
  privateRequest,
} from "@/lib/import/client";
import {
  sourceLabels,
  sourceRank,
  type InboxItem,
  type PageExtractionResult,
} from "@/lib/import/schema";
import { useRecruitmentMonitor } from "@/lib/recruitment-client";
import type { Application } from "@/lib/types";
export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="tag">
      {sourceLabels[source as keyof typeof sourceLabels] ?? "手動"}
    </span>
  );
}
function Candidate({
  item,
  applications,
  onDone,
}: {
  item: InboxItem;
  applications: Application[];
  onDone: () => void;
}) {
  const p = item.raw_extracted_json,
    all = [...p.deadlines, ...p.events, ...p.detectedSelectionSteps];
  const [target, setTarget] = useState(
    applications.find(
      (a) =>
        a.company_name === p.companyName &&
        a.position_name === p.recruitmentName,
    )?.id ?? "",
  );
  const [company, setCompany] = useState(p.companyName ?? ""),
    [year, setYear] = useState(p.graduationYear?.toString() ?? ""),
    [fields, setFields] = useState(["company", "recruitment", "flow"]);
  const [selected, setSelected] = useState(all.map((i) => i.key)),
    [tasks, setTasks] = useState(true),
    [calendar, setCalendar] = useState(true),
    [override, setOverride] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const old = applications.find((a) => a.id === target);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((i) => i !== value) : [...list, value];
  async function approve(reject = false) {
    setError("");
    setBusy(true);
    try {
      if (!reject && (!company.trim() || !year))
        throw new Error("企業名と卒年度を確認してください");
      await reviewImport({
        inbox_id: item.id,
        application_id: target || null,
        company_name: company || "未確認",
        graduation_year: Number(year) || 2028,
        fields,
        item_keys: selected,
        tasks,
        calendar,
        reject,
        allow_override: override,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "反映できませんでした");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel p-5 mb-5">
      <div className="flex gap-3 items-center flex-wrap">
        <SourceBadge source={item.source_type} />
        <h2 className="font-semibold">
          {p.companyName ?? "企業名を確認"} · {p.recruitmentName ?? p.pageTitle}
        </h2>
        <span className="muted text-xs">
          {new Date(item.created_at).toLocaleString("ja-JP")} ·{" "}
          {p.parserProvider} · {Math.round(p.confidence * 100)}%
        </span>
      </div>
      {p.pageUrl && (
        <a
          href={p.pageUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          元ページを開く ↗
        </a>
      )}
      {p.warnings.map((w) => (
        <p className="text-xs muted mt-2" key={w}>
          {w}
        </p>
      ))}
      <div className="form-grid mt-4">
        <label className="span-2">
          反映先
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              const a = applications.find((a) => a.id === e.target.value);
              if (a) {
                setCompany(a.company_name);
                setYear(String(a.graduation_year));
              }
            }}
          >
            <option value="">新規企業・募集として追加</option>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company_name} / {a.position_name || a.job_category} /{" "}
                {a.graduation_year}卒
              </option>
            ))}
          </select>
        </label>
        <label>
          企業名
          <input
            value={company}
            maxLength={120}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label>
          卒年度
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 my-4">
        {[
          ["company", "企業情報"],
          ["recruitment", "募集情報"],
          ["flow", "選考フロー"],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={fields.includes(key)}
              onChange={() => setFields(toggle(fields, key))}
            />{" "}
            {label}
          </label>
        ))}
      </div>
      {old && (
        <p className="text-xs muted">
          現在：{old.position_name || "募集名未設定"} / 応募締切{" "}
          {old.application_deadline_value ??
            old.application_deadline ??
            "未設定"}{" "}
          → 承認した項目だけ更新
        </p>
      )}
      <div className="space-y-3">
        {all.map((x) => {
          const previous = [
            ...(item.previous_json?.deadlines ?? []),
            ...(item.previous_json?.events ?? []),
            ...(item.previous_json?.detectedSelectionSteps ?? []),
          ].find((a) => a.key === x.key);
          return (
            <div key={x.key} className="rounded-lg border p-3">
              <label className="flex gap-2 items-start">
                <input
                  type="checkbox"
                  checked={selected.includes(x.key)}
                  onChange={() => setSelected(toggle(selected, x.key))}
                />
                <span>
                  <strong>{x.title}</strong>
                  <br />
                  {previous?.date ?? "未設定"} →{" "}
                  {x.date ??
                    (x.dateLabel
                      ? `${x.dateLabel}（年不明・日程未登録）`
                      : "日程未設定")}
                  {x.end && ` 〜 ${x.end}`}
                </span>
              </label>
              <details className="mt-2 text-xs muted">
                <summary>証拠テキスト</summary>
                <p className="whitespace-pre-wrap">
                  {x.evidence || "明確な記載なし"}
                </p>
              </details>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 mt-4">
        <label>
          <input
            type="checkbox"
            checked={tasks}
            onChange={(e) => setTasks(e.target.checked)}
          />{" "}
          選択した日程からタスクを作る
        </label>
        <label>
          <input
            type="checkbox"
            checked={calendar}
            onChange={(e) => setCalendar(e.target.checked)}
          />{" "}
          日程をカレンダーへ追加する（日時未確認の候補は追加しません）
        </label>
        <label>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />{" "}
          手動修正・優先度の高い情報がある場合も、今回選択した内容で置き換える
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-600 my-3">
          {error}
        </p>
      )}
      <div className="flex gap-3 mt-4">
        <Button disabled={busy} onClick={() => approve()}>
          確認して反映
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => approve(true)}>
          却下
        </Button>
      </div>
    </article>
  );
}
export function ImportInbox() {
  const inbox = useInbox(),
    store = useStore(),
    monitor = useRecruitmentMonitor(),
    query = useQueryClient();
  const [text, setText] = useState(""),
    [company, setCompany] = useState(""),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState<PageExtractionResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false);
  const done = () => {
    query.invalidateQueries({ queryKey: ["import-inbox"] });
    query.invalidateQueries({ queryKey: ["store"] });
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR CAREER INBOX"
        title="自動取得"
        description="MyPage・採用メール・公式サイトの情報を、確認して自分の手帳へ。"
      />
      <div className="flex gap-4 mb-5">
        <Link className="text-link" href="/settings#connections">
          拡張・Gmailの接続設定 →
        </Link>
        <Link className="text-link" href="/planner">
          今日は何をすればいい？ →
        </Link>
      </div>
      <section className="panel p-5 mb-6">
        <h2 className="font-semibold">テキストから取り込み</h2>
        <p className="muted text-sm my-2">
          スマホではMyPageのお知らせやメールの日程部分を貼り付けます。入力欄・ES回答・個人情報は貼り付けないでください。解析はこの端末で行い、保存前に候補を表示します。
        </p>
        <div className="form-grid">
          <label>
            企業名（分かる場合）
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            取得元URL（任意）
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
            />
          </label>
          <label className="span-2">
            取り込むテキスト
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={50000}
              placeholder="MIXI 2028卒 エンジニア職&#10;本エントリーシートの初回提出期限は【2026/9/28(月) 23:59 JST】までです。"
            />
          </label>
        </div>
        <Button
          className="mt-3"
          disabled={!text.trim() || busy}
          onClick={() => {
            setError("");
            try {
              setPreview(
                parsePage({
                  text,
                  title: company || "テキストから取り込み",
                  url,
                  companyName: company,
                }),
              );
            } catch {
              setError(
                "解析できませんでした。日程のお知らせ部分に絞ってください",
              );
            }
          }}
        >
          この端末で解析する
        </Button>
        {preview && (
          <div className="mt-4 border rounded-lg p-4">
            <h3 className="font-semibold">送信内容の確認</h3>
            <p>
              {preview.companyName ?? "企業名未確認"} /{" "}
              {preview.graduationYear ?? "卒年度未確認"} /{" "}
              {preview.recruitmentType}
            </p>
            {[
              ...preview.deadlines,
              ...preview.events,
              ...preview.detectedSelectionSteps,
            ].map((x) => (
              <p className="text-sm my-2" key={x.key}>
                {x.title} — {x.date ?? x.dateLabel ?? "日時未確認"}
                <small className="block muted whitespace-pre-wrap">
                  {x.evidence}
                </small>
              </p>
            ))}
            {preview.warnings.map((w) => (
              <p key={w} className="muted text-xs">
                {w}
              </p>
            ))}
            <Button
              disabled={
                busy ||
                (!preview.deadlines.length &&
                  !preview.events.length &&
                  !preview.detectedSelectionSteps.length)
              }
              className="mt-3"
              onClick={async () => {
                setBusy(true);
                try {
                  await addTextImport(preview);
                  setPreview(null);
                  setText("");
                  done();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "保存できませんでした",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              この抽出結果をInboxに保存
            </Button>
            {!isDemo && (
              <Button
                variant="outline"
                className="mt-3 ml-2"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await privateRequest("/api/import/manage", {
                      action: "refine",
                      extraction: preview,
                    });
                    setPreview(r.extraction);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "AI補助を利用できませんでした",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                候補の短い証拠だけをAIへ送り補助解析（任意）
              </Button>
            )}
            <p className="muted text-xs mt-2">
              AIは設定時のみ利用し、未設定・失敗時はルール結果を維持します。元の全文は送信しません。保存するのは表示された候補・短い証拠・取得元だけです。
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <div className="flex justify-between mb-4">
        <h2 className="font-semibold">
          確認待ち{" "}
          {inbox.data?.filter((i) => i.status === "pending").length ?? 0}件
        </h2>
        <button className="text-link" onClick={() => setHistory(!history)}>
          {history ? "確認待ちへ" : "取り込み履歴"}
        </button>
      </div>
      {inbox.error && (
        <p role="alert">
          Inboxを取得できません。Supabase設定とmigration 006を確認してください。
        </p>
      )}
      {(inbox.data ?? [])
        .filter((i) =>
          history ? i.status !== "pending" : i.status === "pending",
        )
        .sort((a, b) => sourceRank[b.source_type] - sourceRank[a.source_type])
        .map((item) =>
          history ? (
            <div className="panel p-4 mb-3" key={item.id}>
              <SourceBadge source={item.source_type} />{" "}
              {item.raw_extracted_json.companyName} —{" "}
              {item.status === "approved" ? "反映済み" : "却下"} ·{" "}
              {new Date(item.created_at).toLocaleString("ja-JP")}
            </div>
          ) : (
            <Candidate
              key={item.id}
              item={item}
              applications={store.data?.applications ?? []}
              onDone={done}
            />
          ),
        )}
      {!inbox.isPending &&
        !inbox.error &&
        !inbox.data?.some((i) => i.status === "pending") &&
        !history && (
          <p className="muted mb-6">
            確認待ちはありません。拡張・テキスト・メールから取り込むと、ここに届きます。
          </p>
        )}
      <section className="panel p-5">
        <h2 className="font-semibold">公式サイトからの更新</h2>
        {monitor.data?.candidates
          .filter((c) => c.status === "pending")
          .slice(0, 5)
          .map((c) => (
            <p className="my-3" key={c.id}>
              <SourceBadge source="official" />{" "}
              {c.raw_extracted_json.company_name} ·{" "}
              {c.raw_extracted_json.position_name}
            </p>
          ))}
        <Link href="/templates/updates" className="text-link">
          公式サイトの差分レビューへ →
        </Link>
      </section>
    </>
  );
}
export function InboxNotice() {
  const { data } = useInbox();
  const count = data?.filter((i) => i.status === "pending").length ?? 0;
  return (
    <div className="panel p-4 mb-5 flex flex-wrap justify-between gap-3">
      <Link href="/inbox" className="text-link">
        自動取得Inbox · 確認待ち {count}件 →
      </Link>
      <Link href="/planner" className="text-link">
        今日は何をすればいい？ →
      </Link>
    </div>
  );
}
