"use client";
import { SourceBadge } from "./import-inbox";
import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Pencil, Trash2 } from "lucide-react";
import { useStore, useAction } from "./providers";
import { saveChild, removeChild } from "@/lib/repository";
import type { Task } from "@/lib/types";
import { daysUntil } from "@/lib/dates";
import { ChildForm } from "./child-form";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { DueBadge, Empty, ErrorState, Loading, PageHeading } from "./shared";
export function Tasks() {
  const { data, error, isPending, refetch } = useStore();
  const [filter, setFilter] = useState("active");
  const [edit, setEdit] = useState<Task | null | undefined>();
  const [remove, setRemove] = useState<Task>();
  const action = useAction();
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const tasks = data.tasks
    .filter((t) =>
      filter === "all" || filter === "done"
        ? filter === "all" || t.completed
        : !t.completed &&
          (filter === "active" ||
            (!!t.due_date &&
              (filter === "today"
                ? daysUntil(t.due_date) === 0
                : daysUntil(t.due_date) < 0))),
    )
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return (
    <>
      <PageHeading
        eyebrow="ONE THING AT A TIME"
        title="タスク"
        description="小さなアクションを、確かな前進に。"
      >
        <Button
          disabled={!data.applications.length}
          onClick={() => setEdit(null)}
        >
          <Plus size={16} />
          タスクを追加
        </Button>
      </PageHeading>
      <div className="panel">
        <div className="tabs">
          {[
            ["active", "未完了"],
            ["today", "今日"],
            ["overdue", "期限超過"],
            ["done", "完了済み"],
            ["all", "すべて"],
          ].map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={filter === k ? "active" : ""}
            >
              {v}
            </button>
          ))}
        </div>
        {tasks.map((t) => (
          <div key={t.id} className="task-row">
            <button
              aria-label={`${t.title}を${t.completed ? "未完了" : "完了"}にする`}
              className={`task-check ${t.completed ? "checked" : ""}`}
              disabled={action.busy}
              onClick={() =>
                action.run(() =>
                  saveChild("tasks", { ...t, completed: !t.completed }),
                )
              }
            >
              {t.completed && <Check size={12} />}
            </button>
            <Link href={`/companies/${t.user_application_id}`}>
              <strong className={t.completed ? "line-through muted" : ""}>
                {t.title}
              </strong>
              <small>
                {
                  data.applications.find((a) => a.id === t.user_application_id)
                    ?.company_name
                }{" "}
                · {t.task_type}
              </small>
            </Link>
            {t.field_provenance?.due_value && (
              <SourceBadge source={t.field_provenance.due_value.source_type} />
            )}
            <DueBadge date={t.due_value ?? t.due_date} />
            <button
              aria-label={`${t.title}を編集`}
              className="icon-button"
              onClick={() => setEdit(t)}
            >
              <Pencil size={15} />
            </button>
            <button
              aria-label={`${t.title}を削除`}
              className="icon-button"
              onClick={() => setRemove(t)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <Empty
            text={
              data.applications.length
                ? "この条件のタスクはありません"
                : "企業を追加すると、タスクを登録できます"
            }
          >
            {!data.applications.length && (
              <Button asChild>
                <Link href="/companies">企業一覧へ</Link>
              </Button>
            )}
          </Empty>
        )}
      </div>
      {edit !== undefined && (
        <ChildForm
          table="tasks"
          applications={data.applications}
          item={edit ?? undefined}
          onClose={() => setEdit(undefined)}
        />
      )}
      <Dialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(undefined)}
        title="タスクを削除"
        description={`「${remove?.title ?? ""}」を削除します。この操作は取り消せません。`}
      >
        <div className="form-footer">
          <Button variant="outline" onClick={() => setRemove(undefined)}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={async () => {
              if (
                remove &&
                (await action.run(
                  () => removeChild("tasks", remove.id),
                  "削除しました",
                ))
              )
                setRemove(undefined);
            }}
          >
            削除する
          </Button>
        </div>
      </Dialog>
    </>
  );
}
