"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Copy, ArrowUpRight, Library, EyeOff } from "lucide-react";
import { useTemplates, useAction } from "./providers";
import { copyTemplate, setTemplatePublic } from "@/lib/repository";
import { similarTemplates } from "@/lib/templates";
import { selectionTypes, type Template } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { initializeUser } from "@/lib/supabase";
import { Button } from "./ui/button";
import {
  CompanyMark,
  DueBadge,
  Empty,
  ErrorState,
  Loading,
  PageHeading,
} from "./shared";
export function Templates() {
  const { data, error, isPending, refetch } = useTemplates();
  const { data: user } = useQuery({
    queryKey: ["identity"],
    queryFn: initializeUser,
  });
  const action = useAction();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [selection, setSelection] = useState("");
  const [mine, setMine] = useState(false);
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const visible = data.filter((t) =>
    mine ? t.created_by_user_id === user : t.public,
  );
  const items = (
    query
      ? similarTemplates(visible, query, undefined, "", "", Infinity, mine)
      : visible
  ).filter(
    (t) =>
      (!year || t.graduation_year === Number(year)) &&
      (!selection || t.selection_type === selection),
  );
  async function copy(t: Template, edit: boolean) {
    await action.run(async () => {
      const id = await copyTemplate(t);
      router.push(`/companies/${id}${edit ? "?edit=1" : ""}`);
    }, "募集を引用しました");
  }
  return (
    <>
      <PageHeading
        eyebrow="SHARED KNOWLEDGE"
        title="みんなの募集"
        description="募集情報を見つけて、自分の手帳に。"
      >
        <span className="tag">
          <Library size={13} />
          公開テンプレート
        </span>
      </PageHeading>
      <div className="templates-intro">
        <div>
          <h2>情報を共有して、準備に時間を。</h2>
          <p>
            引用した情報は自分用に編集できます。元の募集が変わっても、あなたの記録は変わりません。
          </p>
        </div>
        <Copy size={36} strokeWidth={1} />
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
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="公開募集を検索"
              placeholder="企業名で検索（例：楽天）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
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
            aria-label="選考区分で絞り込み"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">すべての選考区分</option>
            {selectionTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted text-xs mb-4">
        {items.length} 件の募集 ·
        投稿情報は必ず公式募集ページで確認してください。サンプル募集は日程未設定です。
      </p>
      <div className="template-grid">
        {items.map((t) => (
          <article className="panel template-card" key={t.id}>
            <div className="flex justify-between items-center">
              <CompanyMark name={t.company_name} />
              <span className="tag">{t.graduation_year}卒</span>
            </div>
            <h2>{t.company_name}</h2>
            <p>{t.position_name || t.job_category}</p>
            <div className="flex gap-2 my-4">
              <span className="tag">{t.selection_type}</span>
              {!t.public && (
                <span className="tag">
                  <EyeOff size={12} />
                  非公開
                </span>
              )}
            </div>
            <div className="template-dates">
              <span>応募締切</span>
              <DueBadge date={t.application_deadline} />
            </div>
            {t.public_flow.length > 0 && (
              <div className="template-flow">
                {t.public_flow.map((s, i) => (
                  <span key={i}>
                    {i > 0 && " → "}
                    {s.title}
                  </span>
                ))}
              </div>
            )}
            {t.url && (
              <a
                className="text-link text-xs mt-4"
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                募集ページを開く
                <ArrowUpRight size={12} />
              </a>
            )}
            <div className="template-actions">
              <Button
                size="sm"
                disabled={action.busy || !t.public}
                onClick={() => copy(t, false)}
              >
                <Copy size={14} />
                引用
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy || !t.public}
                onClick={() => copy(t, true)}
              >
                引用して編集
              </Button>
              {t.created_by_user_id === user && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => setTemplatePublic(t.id, !t.public),
                      t.public ? "非公開にしました" : "公開しました",
                    )
                  }
                >
                  {t.public ? "非公開にする" : "公開する"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 && (
        <Empty text="一致する募集はありません。企業詳細の「募集を公開」から投稿できます。" />
      )}
    </>
  );
}
