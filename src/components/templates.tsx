"use client";
import { useState, useDeferredValue, useRef } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useTemplates, useAction, useStore } from "./providers";
import {
  setTemplatePublic,
  setTemplateStatus,
  copyTemplate,
  loadStore,
} from "@/lib/repository";
import { similarTemplates } from "@/lib/templates";
import { selectionTypes, jobCategories } from "@/lib/types";
import { initializeUser } from "@/lib/supabase";
import { Button } from "./ui/button";
import { TemplateCard } from "./template-card";
import { Empty, ErrorState, Loading, PageHeading } from "./shared";
export function CompanyTabs({ active }: { active: "companies" | "templates" }) {
  return (
    <nav className="tabs company-tabs mb-5" aria-label="企業の表示">
      <Link
        className={active === "companies" ? "active" : ""}
        href="/companies"
      >
        自分の企業
      </Link>
      <Link
        className={active === "templates" ? "active" : ""}
        href="/templates"
      >
        募集を探す
      </Link>
    </nav>
  );
}
export function Templates() {
  const { data, error, isPending, refetch } = useTemplates();
  const { data: user } = useQuery({
    queryKey: ["identity"],
    queryFn: initializeUser,
  });
  const action = useAction();
  const store = useStore();
  const queryClient = useQueryClient();
  const copying = useRef(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [year, setYear] = useState("");
  const [selection, setSelection] = useState("");
  const [industry, setIndustry] = useState("");
  const [job, setJob] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [mine, setMine] = useState(false);
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const visible = data.filter((t) =>
    mine ? t.created_by_user_id === user : t.public && !!t.url,
  );
  const items = (
    deferred
      ? similarTemplates(visible, deferred, undefined, "", "", Infinity, mine)
      : visible
  ).filter(
    (t) =>
      (!year || t.graduation_year === Number(year)) &&
      (!selection || t.selection_type === selection) &&
      (!industry || t.industry === industry) &&
      (!job ||
        [t.job_category, ...(t.tags ?? [])].some((v) =>
          v.toLowerCase().includes(job.toLowerCase()),
        )) &&
      (!openOnly || t.application_status === "open"),
  );
  const copiedIds = new Set(
    store.data?.applications.map((a) => a.recruitment_template_id),
  );
  const remaining = items.filter(
    (t) => t.public && !!t.url && !copiedIds.has(t.id),
  );
  async function copyAll() {
    if (copying.current) return;
    copying.current = true;
    setBulkBusy(true);
    setBulkStatus("引用済みの募集を確認しています…");
    let added = 0;
    try {
      // Recheck persisted copies so retrying a partial batch skips successes.
      const latest = await loadStore();
      const existing = new Set(
        latest.applications.map((a) => a.recruitment_template_id),
      );
      const targets = items.filter(
        (t) => t.public && !!t.url && !existing.has(t.id),
      );
      for (const t of targets) {
        setBulkStatus(`${added} / ${targets.length} 件を引用中…`);
        await copyTemplate(t);
        added += 1;
      }
      const message = added
        ? `${added}件を応募予定に引用しました。志望度は「自分の企業」から設定できます。`
        : "表示中の募集はすべて引用済みです。";
      setBulkStatus(message);
      toast.success(message);
    } catch {
      const message = `${added}件を引用しました。処理を中断しました。通信状況と募集の公開状態を確認して再実行してください。引用済みの募集はスキップします。`;
      setBulkStatus(message);
      toast.error(message);
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["store"] });
      setBulkBusy(false);
      copying.current = false;
    }
  }
  return (
    <>
      <Link className="text-link mb-3 inline-block" href="/templates/updates">
        募集情報の更新を確認 →
      </Link>
      <PageHeading
        eyebrow="SHARED KNOWLEDGE"
        title="募集を探す"
        description="公式情報を確認して、次の応募を自分の手帳へ。"
      />
      <CompanyTabs active="templates" />
      <div className="templates-intro">
        <div>
          <h2>情報を共有して、準備に時間を。</h2>
          <p>
            公開情報のコピーは自分専用。元の情報が更新されても、自動では変更されません。
          </p>
        </div>
      </div>
      <div className="panel mb-6">
        <div className="tabs">
          <button
            className={!mine ? "active" : ""}
            onClick={() => setMine(false)}
          >
            公開募集
          </button>
          <button
            className={mine ? "active" : ""}
            onClick={() => setMine(true)}
          >
            自分の投稿
          </button>
        </div>
        <div className="list-toolbar template-filters">
          <input
            aria-label="公開募集を検索"
            placeholder="企業名（例：楽天・Rakuten）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="卒年度で絞り込み"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">すべての卒年度</option>
            {[...new Set(data.map((t) => t.graduation_year))]
              .sort()
              .map((y) => (
                <option key={y} value={y}>
                  {y}卒
                </option>
              ))}
          </select>
          <select
            aria-label="業界で絞り込み"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">すべての業界</option>
            {[...new Set(data.map((t) => t.industry).filter(Boolean))]
              .sort()
              .map((i) => (
                <option key={i}>{i}</option>
              ))}
          </select>
          <input
            aria-label="職種で絞り込み"
            placeholder="職種・カテゴリー"
            list="job-categories"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
          <datalist id="job-categories">
            {jobCategories.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
          <select
            aria-label="選考区分で絞り込み"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">すべての募集種別</option>
            {selectionTypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            募集中のみ
          </label>
        </div>
        <div className="filter-bar flex-wrap">
          {["本選考", "インターン", "採用直結インターン", "早期選考"].map(
            (s) => (
              <Button
                key={s}
                size="sm"
                variant={selection === s ? "default" : "outline"}
                aria-pressed={selection === s}
                onClick={() => setSelection(selection === s ? "" : s)}
              >
                {s === "採用直結インターン" ? "採用直結" : s}のみ
              </Button>
            ),
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="muted text-xs">
          表示中 {items.length} 件 · 未引用 {remaining.length} 件
        </p>
        <Button
          disabled={
            bulkBusy ||
            !store.data ||
            !!store.error ||
            !remaining.length ||
            query !== deferred
          }
          onClick={copyAll}
        >
          <Copy size={14} />
          {bulkBusy ? "引用中…" : "すべて引用"}
        </Button>
      </div>
      <p className="muted text-xs mb-3">
        「すべて引用」は表示中の未引用の募集を応募予定に追加します。引用済みの募集はスキップします。
      </p>
      <p role="status" aria-live="polite" className="text-sm mb-4">
        {bulkStatus}
      </p>
      <p className="muted text-xs mb-4">
        {items.length} 件 ·
        監視テンプレートのタグは企業分野です。2028卒の職種募集を保証するものではありません。応募前に公式サイトを確認してください。
      </p>
      <div className="template-grid">
        {items.map((t) => (
          <TemplateCard template={t} key={t.id} copyDisabled={bulkBusy}>
            {t.created_by_user_id === user && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(() =>
                      setTemplateStatus(
                        t.id,
                        t.application_status === "closed" ? "open" : "closed",
                      ),
                    )
                  }
                >
                  {t.application_status === "closed"
                    ? "募集中に戻す"
                    : "募集終了にする"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.busy || (!t.public && !t.url)}
                  onClick={() =>
                    action.run(() => setTemplatePublic(t.id, !t.public))
                  }
                >
                  {t.public ? "非公開にする" : "公開する"}
                </Button>
              </>
            )}
          </TemplateCard>
        ))}
      </div>
      {!items.length && <Empty text="条件に一致する募集はありません" />}
    </>
  );
}
