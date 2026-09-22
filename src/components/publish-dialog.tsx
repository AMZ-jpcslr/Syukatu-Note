"use client";
import { useState } from "react";
import type { Application, EventType } from "@/lib/types";
import { eventTypes } from "@/lib/types";
import { publishTemplate } from "@/lib/repository";
import { displayDate } from "@/lib/dates";
import { similarTemplates } from "@/lib/templates";
import { TemplateCopyButtons } from "./template-card";
import { useTemplates, useAction } from "./providers";
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
  const { data: templates = [] } = useTemplates();
  const similar = similarTemplates(
    templates,
    a.company_name,
    a.graduation_year,
    a.job_category,
    a.position_name,
    3,
    false,
    a.selection_type,
  );
  const [official, setOfficial] = useState(false);
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
      {!!similar.length && (
        <div className="similar-box">
          <strong>似た募集があります</strong>
          {similar.map((t) => (
            <div key={t.id}>
              <span>
                {t.company_name} · {t.position_name} · {t.selection_type}
              </span>
              <TemplateCopyButtons template={t} compact />
            </div>
          ))}
        </div>
      )}
      <label className="inline-check my-4">
        <input
          type="checkbox"
          checked={official}
          onChange={(e) => setOfficial(e.target.checked)}
        />
        募集URLが企業の公式採用ページであることを確認しました
      </label>
      {!a.url && (
        <p className="field-error">
          概要の編集から公式採用URLを登録してください。
        </p>
      )}
      <p className="muted text-xs">
        投稿は「未確認」で公開されます。公式URLの入力だけでは「確認済み」にはなりません。
      </p>
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
          disabled={action.busy || !a.url || !official}
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
