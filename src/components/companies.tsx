"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from "lucide-react";
import { CompanyTabs } from "./templates";
import { useStore } from "./providers";
import { ApplicationForm } from "./application-form";
import { Button } from "./ui/button";
import {
  CompanyMark,
  DueBadge,
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  Progress,
  StatusBadge,
} from "./shared";
import { priorities, statuses, selectionTypes } from "@/lib/types";
import { progress } from "@/lib/dates";
export function Companies() {
  const { data, error, isPending, refetch } = useStore();
  const [add, setAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("table");
  const [sort, setSort] = useState("deadline");
  const [filter, setFilter] = useState<Record<string, string>>(() => ({
    status:
      typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("status") ?? "")
        : "",
  }));
  const set = (key: string, value: string) =>
    setFilter({ ...filter, [key]: value });
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const items = data.applications
    .filter(
      (a) =>
        (!search ||
          [a.company_name, a.job_category, a.position_name, ...a.tags]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!filter.industry || a.industry === filter.industry) &&
        (!filter.job || a.job_category === filter.job) &&
        (!filter.selection || a.selection_type === filter.selection) &&
        (!filter.status || a.status === filter.status) &&
        (!filter.priority || a.priority === filter.priority) &&
        (!filter.from ||
          (!!a.application_deadline &&
            a.application_deadline >= filter.from)) &&
        (!filter.to ||
          (!!a.application_deadline && a.application_deadline <= filter.to)),
    )
    .sort((a, b) =>
      sort === "priority"
        ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
        : sort === "created"
          ? b.created_at.localeCompare(a.created_at)
          : sort === "progress"
            ? progress(data, b.id).percent - progress(data, a.id).percent
            : (a.application_deadline ?? "9999").localeCompare(
                b.application_deadline ?? "9999",
              ),
    );
  return (
    <>
      <PageHeading
        eyebrow="MY APPLICATIONS"
        title="企業一覧"
        description={`${data.applications.length}社の選考を、ひとつの場所で。`}
      >
        <Button onClick={() => setAdd(true)}>
          <Plus size={16} />
          企業を追加
        </Button>
      </PageHeading>
      <CompanyTabs active="companies" />
      <div className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="企業を検索"
              placeholder="企業名・職種・タグで検索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="並び替え"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="deadline">締切が近い順</option>
            <option value="priority">志望度順</option>
            <option value="created">登録日順</option>
            <option value="progress">進捗順</option>
          </select>
          <div className="segmented">
            <button
              aria-label="テーブル表示"
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              <List size={17} />
            </button>
            <button
              aria-label="カード表示"
              className={view === "card" ? "active" : ""}
              onClick={() => setView("card")}
            >
              <LayoutGrid size={17} />
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <SlidersHorizontal size={15} />
          {[
            {
              key: "industry",
              label: "業界",
              values: [
                ...new Set(data.applications.map((a) => a.industry)),
              ].filter(Boolean),
            },
            {
              key: "job",
              label: "職種",
              values: [
                ...new Set(data.applications.map((a) => a.job_category)),
              ].filter(Boolean),
            },
            { key: "selection", label: "選考区分", values: selectionTypes },
            { key: "status", label: "ステータス", values: statuses },
            { key: "priority", label: "志望度", values: priorities },
          ].map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              value={filter[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">{f.label}：すべて</option>
              {f.values.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ))}
          <label>
            締切
            <input
              type="date"
              aria-label="締切期間の開始"
              value={filter.from ?? ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <span>〜</span>
          <input
            type="date"
            aria-label="締切期間の終了"
            value={filter.to ?? ""}
            onChange={(e) => set("to", e.target.value)}
          />
          <button
            className="text-link"
            onClick={() => {
              setFilter({});
              setSearch("");
            }}
          >
            クリア
          </button>
        </div>
        <div className="list-result-count">{items.length} 件の企業</div>
        {view === "table" ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>企業 / 募集</th>
                  <th>業界・職種</th>
                  <th>選考区分</th>
                  <th>締切</th>
                  <th>ステータス</th>
                  <th>志望度</th>
                  <th>進捗</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/companies/${a.id}`}
                        className="company-cell"
                      >
                        <CompanyMark name={a.company_name} />
                        <div>
                          <strong>{a.company_name}</strong>
                          <small>
                            {a.graduation_year}卒 ·{" "}
                            {a.position_name || a.job_category}
                          </small>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span>{a.industry || "—"}</span>
                      <small className="block muted">
                        {a.job_category || "—"}
                      </small>
                    </td>
                    <td>
                      <span className="tag">{a.selection_type}</span>
                    </td>
                    <td>
                      <DueBadge date={a.application_deadline} />
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>
                      <span className={`priority-badge priority-${a.priority}`}>
                        {a.priority}
                      </span>
                    </td>
                    <td>
                      <Progress {...progress(data, a.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="company-card-grid">
            {items.map((a) => (
              <Link
                className="company-card"
                href={`/companies/${a.id}`}
                key={a.id}
              >
                <div className="flex justify-between">
                  <CompanyMark name={a.company_name} />
                  <span className="priority-badge">{a.priority}</span>
                </div>
                <h3>{a.company_name}</h3>
                <p>
                  {a.graduation_year}卒 · {a.job_category}
                </p>
                <div className="flex justify-between my-5 gap-2">
                  <StatusBadge status={a.status} />
                  <DueBadge date={a.application_deadline} />
                </div>
                <Progress {...progress(data, a.id)} />
              </Link>
            ))}
          </div>
        )}
        {items.length === 0 && (
          <Empty
            text={
              data.applications.length
                ? "条件に一致する企業がありません"
                : "最初の企業を登録しましょう"
            }
          >
            <Button onClick={() => setAdd(true)}>
              <Plus size={15} />
              企業を追加
            </Button>
          </Empty>
        )}
      </div>
      <ApplicationForm open={add} onClose={() => setAdd(false)} />
    </>
  );
}
