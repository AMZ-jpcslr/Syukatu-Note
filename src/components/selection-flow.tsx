"use client";
import { useState } from "react";
import {
  Check,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import type { Step } from "@/lib/types";
import { stepStatuses } from "@/lib/types";
import { reorderSteps, saveChild } from "@/lib/repository";
import { isStepDone } from "@/lib/workflow";
import { displayDate, jstTime } from "@/lib/dates";
import { useAction } from "./providers";
import { Button } from "./ui/button";
import { DueBadge, Empty, ExternalLink } from "./shared";
export function SelectionFlow({
  steps,
  applicationId,
  onAdd,
  onEdit,
  onRemove,
}: {
  steps: Step[];
  applicationId: string;
  onAdd: () => void;
  onEdit: (step: Step) => void;
  onRemove: (step: Step) => void;
}) {
  const action = useAction();
  const [dragged, setDragged] = useState<string>();
  async function move(id: string, target: number) {
    const ids = steps.map((s) => s.id);
    const from = ids.indexOf(id);
    if (from < 0 || target < 0 || target >= ids.length || from === target)
      return;
    ids.splice(from, 1);
    ids.splice(target, 0, id);
    await action.run(
      () => reorderSteps(applicationId, ids),
      "選考の順序を保存しました",
    );
    setDragged(undefined);
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>選考フロー</h2>
        <Button size="sm" onClick={onAdd}>
          <Plus size={14} />
          ステップを追加
        </Button>
      </div>
      <p className="muted text-xs px-6">
        ドラッグ、または上下ボタンで並び替え。日付を設定するとタスク・カレンダーに連携します（設定で変更可）。
      </p>
      <ol className="flow-list">
        {steps.map((s, index) => (
          <li
            key={s.id}
            className={`flow-step ${dragged === s.id ? "opacity-50" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged) void move(dragged, index);
            }}
          >
            <span className="step-number">
              {s.completed ? <Check size={14} /> : index + 1}
            </span>
            <div className="flow-step-body">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  className="icon-button cursor-grab"
                  draggable={!action.busy}
                  aria-label={`${s.title}をドラッグして移動`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", s.id);
                    setDragged(s.id);
                  }}
                  onDragEnd={() => setDragged(undefined)}
                >
                  <GripVertical size={16} />
                </button>
                <h3 className={s.completed ? "line-through muted" : ""}>
                  {s.title}
                </h3>
                <span className="tag">{s.step_type}</span>
                <select
                  className="step-state"
                  aria-label={`${s.title}の状態`}
                  value={s.state ?? (s.completed ? "完了" : "未着手")}
                  disabled={action.busy}
                  onChange={(e) => {
                    const state = e.target.value as Step["state"];
                    void action.run(() =>
                      saveChild("selection_steps", {
                        ...s,
                        state,
                        completed: isStepDone(state!),
                      }),
                    );
                  }}
                >
                  {stepStatuses.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <div className="record-actions">
                  <button
                    className="icon-button"
                    disabled={action.busy || index === 0}
                    aria-label={`${s.title}を上へ`}
                    onClick={() => move(s.id, index - 1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={action.busy || index === steps.length - 1}
                    aria-label={`${s.title}を下へ`}
                    onClick={() => move(s.id, index + 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${s.title}を編集`}
                    onClick={() => onEdit(s)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${s.title}を削除`}
                    onClick={() => onRemove(s)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flow-step-dates">
                {s.deadline && (
                  <span>
                    期限 <DueBadge date={s.deadline} />
                  </span>
                )}
                {s.scheduled_at && (
                  <span>
                    {displayDate(s.scheduled_at)} {jstTime(s.scheduled_at)}
                  </span>
                )}
                {s.result && <span>結果：{s.result}</span>}
              </div>
              {s.memo && (
                <p className="whitespace-pre-wrap muted text-sm mt-3">
                  {s.memo}
                </p>
              )}
              {s.url && (
                <div className="mt-3">
                  <ExternalLink url={s.url} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!steps.length && (
        <Empty text="選考フローは未登録です。公式情報を確認してステップを追加しましょう。" />
      )}
    </section>
  );
}
