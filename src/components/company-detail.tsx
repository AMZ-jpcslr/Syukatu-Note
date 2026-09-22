"use client";
import { SelectionFlow } from "./selection-flow";
import { ESSearch } from "./es-search";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Check,
  LockKeyhole,
} from "lucide-react";
import { useStore, useAction } from "./providers";
import { ApplicationForm } from "./application-form";
import { ChildForm } from "./child-form";
import { PublishDialog } from "./publish-dialog";
import {
  saveApplication,
  saveChild,
  removeApplication,
  removeChild,
} from "@/lib/repository";
import { progress, displayDate, jstTime } from "@/lib/dates";
import type { Child, ChildTable } from "@/lib/types";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import {
  CompanyMark,
  DueBadge,
  Empty,
  ErrorState,
  ExternalLink,
  Loading,
  Progress,
  StatusBadge,
} from "./shared";
export function CompanyDetail({
  id,
  initialEdit = false,
  initialTab = "概要",
}: {
  id: string;
  initialEdit?: boolean;
  initialTab?: string;
}) {
  const { data, error, isPending, refetch } = useStore();
  const action = useAction();
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [edit, setEdit] = useState(initialEdit);
  const [publish, setPublish] = useState(false);
  const [child, setChild] = useState<{ table: ChildTable; item?: Child }>();
  const [remove, setRemove] = useState<{
    table?: ChildTable;
    id: string;
    title: string;
  }>();
  const [research, setResearch] = useState<string>();
  const a = data?.applications.find((a) => a.id === id);
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  if (!a)
    return (
      <Empty text="この企業が見つかりません">
        <Button asChild>
          <Link href="/companies">企業一覧へ戻る</Link>
        </Button>
      </Empty>
    );
  const steps = data.steps
    .filter((s) => s.user_application_id === id)
    .sort((a, b) => a.order_index - b.order_index);
  const tasks = data.tasks.filter((s) => s.user_application_id === id);
  const es = data.es.filter((s) => s.user_application_id === id);
  const interviews = data.interviews
    .filter((s) => s.user_application_id === id)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const actions = (table: ChildTable, item: Child, title: string) => (
    <div className="record-actions">
      <button
        aria-label={title + "を編集"}
        className="icon-button"
        onClick={() => setChild({ table, item })}
      >
        <Pencil size={15} />
      </button>
      <button
        aria-label={title + "を削除"}
        className="icon-button"
        onClick={() => setRemove({ table, id: item.id, title })}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  return (
    <>
      <Link href="/companies" className="back-link">
        <ArrowLeft size={15} />
        企業一覧に戻る
      </Link>
      <div className="detail-heading">
        <CompanyMark name={a.company_name} />
        <div>
          <p className="eyebrow">{a.graduation_year} GRADUATE</p>
          <h1>{a.company_name}</h1>
          <div className="detail-meta">
            <span>{a.industry || "業界未設定"}</span>
            <span className="priority-badge">{a.priority}</span>
            <StatusBadge status={a.status} />
          </div>
        </div>
        <div className="detail-controls">
          <ExternalLink url={a.url} />
          <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
            <Pencil size={14} />
            編集
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPublish(true)}>
            <Share2 size={14} />
            他の就活生にも共有
          </Button>
        </div>
      </div>
      <div className="detail-progress panel">
        <div>
          <span className="muted text-xs">選考の進捗</span>
          <p>
            {a.position_name || a.job_category} · {a.selection_type}
          </p>
        </div>
        <Progress {...progress(data, id)} />
      </div>
      <div className="tabs detail-tabs">
        {["概要", "選考", "タスク", "ES", "面接", "企業研究"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "概要" && (
        <div className="detail-grid">
          <section className="panel p-6">
            <h2 className="mb-5">募集情報</h2>
            <dl className="detail-dl">
              {[
                ["企業名", a.company_name],
                ["業界", a.industry || "未設定"],
                ["志望度", a.priority],
                ["ステータス", a.status],
                [
                  "最終確認日",
                  a.last_verified_at
                    ? displayDate(a.last_verified_at, "yyyy/M/d")
                    : "未確認",
                ],
                ["募集名", a.position_name || "—"],
                ["職種", a.job_category || "—"],
                ["コース", a.course_name || "—"],
                ["卒年度", a.graduation_year + "卒"],
                ["選考区分", a.selection_type],
                ["応募開始日", displayDate(a.application_start, "yyyy/M/d")],
                ["応募締切", displayDate(a.application_deadline, "yyyy/M/d")],
                ["勤務地", a.location || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">
              <ExternalLink url={a.url} />
            </div>
            <div className="flex gap-2 mt-5 flex-wrap">
              {a.tags.map((t) => (
                <span className="tag" key={t}>
                  #{t}
                </span>
              ))}
            </div>
          </section>
          <section className="panel p-6">
            <h2 className="flex gap-2 items-center mb-5">
              <LockKeyhole size={16} />
              自分用メモ
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-7">
              {a.memo || "気になることや、応募に向けたメモを残しましょう。"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => setEdit(true)}
            >
              メモを編集
            </Button>
            <div className="mt-8 pt-5 border-t border-border">
              <span className="muted text-xs">応募締切</span>
              <div className="mt-2">
                <DueBadge date={a.application_deadline} />
              </div>
            </div>
          </section>
        </div>
      )}
      {tab === "選考" && (
        <SelectionFlow
          steps={steps}
          applicationId={id}
          onAdd={() => setChild({ table: "selection_steps" })}
          onEdit={(s) => setChild({ table: "selection_steps", item: s })}
          onRemove={(s) =>
            setRemove({ table: "selection_steps", id: s.id, title: s.title })
          }
        />
      )}
      {tab === "タスク" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>この企業のタスク</h2>
            <Button size="sm" onClick={() => setChild({ table: "tasks" })}>
              <Plus size={14} />
              タスクを追加
            </Button>
          </div>
          {tasks.map((t) => (
            <div className="task-row" key={t.id}>
              <button
                className={`task-check ${t.completed ? "checked" : ""}`}
                disabled={action.busy}
                aria-label={t.title + "の完了状態を変更"}
                onClick={() =>
                  action.run(() =>
                    saveChild("tasks", { ...t, completed: !t.completed }),
                  )
                }
              >
                {t.completed && <Check size={12} />}
              </button>
              <div className="flex-1">
                <strong className={t.completed ? "line-through muted" : ""}>
                  {t.title}
                </strong>
                <small className="block muted">{t.task_type}</small>
                {t.memo && (
                  <p className="text-sm muted mt-2 whitespace-pre-wrap">
                    {t.memo}
                  </p>
                )}
                {t.url && (
                  <a
                    className="text-link mt-2"
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    関連ページを開く ↗
                  </a>
                )}
              </div>
              <DueBadge date={t.due_date} />
              {actions("tasks", t, t.title)}
            </div>
          ))}
          {!tasks.length && <Empty text="準備や提出のタスクを登録しましょう" />}
        </section>
      )}
      {tab === "ES" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>エントリーシート</h2>
            <Button
              size="sm"
              onClick={() => setChild({ table: "es_questions" })}
            >
              <Plus size={14} />
              設問を追加
            </Button>
          </div>
          <div className="private-label">
            <LockKeyhole size={13} />
            回答はあなただけに表示されます
          </div>
          <ESSearch store={data} />
          {es.map((q) => (
            <article className="note-card" key={q.id}>
              <div className="flex gap-3 items-start">
                <h3 className="flex-1">{q.question}</h3>
                <span className="tag">{q.status}</span>
                {actions("es_questions", q, "設問")}
              </div>
              <p className="whitespace-pre-wrap">
                {q.answer || "まだ回答がありません。"}
              </p>
              <small
                className={
                  Array.from(q.answer).length > q.max_length
                    ? "field-error"
                    : "muted"
                }
              >
                {Array.from(q.answer).length} / {q.max_length}文字
                {q.submitted_at &&
                  ` · 提出 ${displayDate(q.submitted_at, "yyyy/M/d")} ${jstTime(q.submitted_at)}`}
              </small>
            </article>
          ))}
          {!es.length && (
            <Empty text="設問と回答を保存して、ESを仕上げましょう" />
          )}
        </section>
      )}
      {tab === "面接" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>面接の記録</h2>
            <Button
              size="sm"
              onClick={() => setChild({ table: "interview_notes" })}
            >
              <Plus size={14} />
              面接を追加
            </Button>
          </div>
          <div className="private-label">
            <LockKeyhole size={13} />
            面接記録はあなただけに表示されます
          </div>
          {interviews.map((i) => (
            <article key={i.id} className="note-card">
              <div className="flex gap-3 items-center">
                <h3 className="flex-1">{i.stage}</h3>
                <span className="tag">{i.format}</span>
                {actions("interview_notes", i, "面接記録")}
              </div>
              <p className="muted text-sm">
                {displayDate(i.scheduled_at, "yyyy/M/d")}{" "}
                {jstTime(i.scheduled_at)} · 面接官：{i.interviewer || "未記入"}
              </p>
              {i.location_or_url && (
                <p className="text-sm whitespace-pre-wrap">
                  場所・URL：{i.location_or_url}
                </p>
              )}
              {(i.qa_pairs?.length
                ? i.qa_pairs
                : [{ question: i.questions, answer: i.answers }]
              ).map((pair, index) => (
                <div key={index} className="mt-4">
                  <h4 className="text-xs muted">質問 {index + 1}</h4>
                  <p className="whitespace-pre-wrap">
                    {pair.question || "未記入"}
                  </p>
                  <h4 className="text-xs muted mt-2">自分の回答</h4>
                  <p className="whitespace-pre-wrap">
                    {pair.answer || "未記入"}
                  </p>
                </div>
              ))}
              {[
                ["振り返り", i.reflection],
                ["結果", i.result],
              ].map(([k, v]) => (
                <div key={k} className="mt-4">
                  <h4 className="text-xs muted">{k}</h4>
                  <p className="whitespace-pre-wrap">{v || "未記入"}</p>
                </div>
              ))}
            </article>
          ))}
          {!interviews.length && (
            <Empty text="質問や振り返りを、次の面接につなげよう" />
          )}
        </section>
      )}
      {tab === "企業研究" && (
        <section className="panel p-6">
          <h2 className="mb-3">企業研究ノート</h2>
          <p className="muted text-sm mb-4">
            事業内容、強み、気になるニュース、働く人について。
          </p>
          <textarea
            aria-label="企業研究ノート"
            rows={16}
            maxLength={50000}
            className="w-full"
            value={research ?? a.research}
            onChange={(e) => setResearch(e.target.value)}
          />
          <div className="form-footer">
            <Button
              disabled={action.busy}
              onClick={() =>
                action.run(() =>
                  saveApplication({ ...a, research: research ?? a.research }),
                )
              }
            >
              ノートを保存
            </Button>
          </div>
        </section>
      )}
      <div className="mt-8 flex justify-between items-center">
        <span className="muted text-xs">
          登録日 {displayDate(a.created_at, "yyyy/M/d")}
        </span>
        <button
          className="text-link muted"
          onClick={() => setRemove({ id: a.id, title: a.company_name })}
        >
          <Trash2 size={13} />
          この企業を削除
        </button>
      </div>
      <ApplicationForm
        open={edit}
        application={a}
        onClose={() => {
          setEdit(false);
          router.replace(`/companies/${id}`);
        }}
      />
      {publish && (
        <PublishDialog application={a} onClose={() => setPublish(false)} />
      )}
      {child && (
        <ChildForm
          table={child.table}
          item={child.item}
          application={a}
          order={steps.length}
          onClose={() => setChild(undefined)}
        />
      )}
      <Dialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(undefined)}
        title="削除しますか？"
        description={`「${remove?.title ?? ""}」を削除します。${remove?.table === "selection_steps" ? "関連する自動作成タスクも削除されます。" : remove?.table ? "" : "関連する選考・タスク・ES・面接記録も削除されます。"}この操作は取り消せません。`}
      >
        <div className="form-footer">
          <Button variant="outline" onClick={() => setRemove(undefined)}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={async () => {
              if (!remove) return;
              const table = remove.table;
              if (
                await action.run(
                  () =>
                    table
                      ? removeChild(table, remove.id)
                      : removeApplication(remove.id),
                  "削除しました",
                )
              ) {
                setRemove(undefined);
                if (!table) router.push("/companies");
              }
            }}
          >
            削除する
          </Button>
        </div>
      </Dialog>
    </>
  );
}
