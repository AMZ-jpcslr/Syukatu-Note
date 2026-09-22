"use client";
import { useState } from "react";
import type { Application, EventType } from "@/lib/types";
import { eventTypes } from "@/lib/types";
import { publishTemplate } from "@/lib/repository";
import { displayDate } from "@/lib/dates";
import { useAction } from "./providers";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
export function PublishDialog({
  application: a,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const action = useAction();
  const [flow, setFlow] = useState<EventType[]>([]);
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="募集情報を公開する"
      description="下記の情報が、他のユーザーから検索・引用できるようになります。公開前に内容と募集元の利用条件を確認してください。"
    >
      <div className="publish-preview">
        <h3>{a.company_name}</h3>
        <p>
          {a.graduation_year}卒 · {a.job_category}
        </p>
        <p>
          {a.position_name} · {a.selection_type}
        </p>
        <p>
          応募開始 {displayDate(a.application_start)} → 締切{" "}
          {displayDate(a.application_deadline)}
        </p>
        <p className="break-all">{a.url || "募集URLなし"}</p>
      </div>
      <h4 className="my-4 text-sm font-semibold">
        公開されている選考フロー（任意）
      </h4>
      <p className="muted text-xs mb-3">
        公開情報として確認できるステップだけを選択してください。選択した順で登録されます。
      </p>
      <div className="flow-checks">
        {eventTypes
          .filter((t) => !["応募開始", "応募締切"].includes(t))
          .map((t) => (
            <label key={t}>
              <input
                type="checkbox"
                checked={flow.includes(t)}
                onChange={(e) =>
                  setFlow(
                    e.target.checked
                      ? [...flow, t]
                      : flow.filter((x) => x !== t),
                  )
                }
              />
              {t}
            </label>
          ))}
      </div>
      <p className="privacy-callout">
        ES回答・面接記録・自分用メモ・選考結果・タスク・志望度は公開されません。
      </p>
      <div className="form-footer">
        <Button variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button
          disabled={action.busy}
          onClick={async () => {
            if (
              await action.run(
                () =>
                  publishTemplate(
                    a,
                    flow.map((t) => ({ title: t, step_type: t })),
                  ),
                "募集情報を公開しました",
              )
            )
              onClose();
          }}
        >
          この内容で公開する
        </Button>
      </div>
    </Dialog>
  );
}
