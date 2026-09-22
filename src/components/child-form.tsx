"use client";
import { useState } from "react";
import type {
  Application,
  Child,
  ChildTable,
  Step,
  Task,
  ESQuestion,
  Interview,
} from "@/lib/types";
import { eventTypes } from "@/lib/types";
import { toInstant, toLocalInput } from "@/lib/dates";
import { safeUrl } from "@/lib/validation";
import { saveChild } from "@/lib/repository";
import { initializeUser } from "@/lib/supabase";
import { useAction } from "./providers";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function ChildForm({
  table,
  application,
  applications,
  item,
  onClose,
  order = 0,
}: {
  table: ChildTable;
  application?: Application;
  applications?: Application[];
  item?: Child;
  onClose: () => void;
  order?: number;
}) {
  const action = useAction();
  const [answer, setAnswer] = useState((item as ESQuestion)?.answer ?? "");
  const [max, setMax] = useState((item as ESQuestion)?.max_length ?? 400);
  const [validation, setValidation] = useState("");
  const value = (key: string): string =>
    item && key in item
      ? String((item as unknown as Record<string, unknown>)[key] ?? "")
      : "";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    if (!safeUrl.safeParse(get("url")).success) {
      setValidation("URLはhttp / httpsで入力してください");
      return;
    }
    const ok = await action.run(async () => {
      const base = {
        id: item?.id ?? crypto.randomUUID(),
        user_id: await initializeUser(),
        user_application_id: application?.id ?? get("user_application_id"),
      };
      let row: Child;
      if (table === "selection_steps")
        row = {
          ...base,
          title: get("title"),
          step_type: get("step_type") as Step["step_type"],
          deadline: get("deadline") || null,
          scheduled_at: toInstant(get("scheduled_at")),
          completed: (item as Step)?.completed ?? false,
          result: get("result"),
          memo: get("memo"),
          url: get("url"),
          order_index: Number(get("order_index")),
        } satisfies Step;
      else if (table === "tasks")
        row = {
          ...base,
          title: get("title"),
          task_type: get("task_type"),
          due_date: get("due_date") || null,
          completed: (item as Task)?.completed ?? false,
          memo: get("memo"),
          url: get("url"),
        } satisfies Task;
      else if (table === "es_questions")
        row = {
          ...base,
          question: get("question"),
          max_length: Number(get("max_length")),
          answer: get("answer"),
          status: get("status") as ESQuestion["status"],
        } satisfies ESQuestion;
      else
        row = {
          ...base,
          scheduled_at: toInstant(get("scheduled_at"))!,
          stage: get("stage"),
          format: get("format") as Interview["format"],
          interviewer: get("interviewer"),
          questions: get("questions"),
          answers: get("answers"),
          reflection: get("reflection"),
          result: get("result"),
        } satisfies Interview;
      await saveChild(table, row);
    });
    if (ok) onClose();
  }
  const title = {
    selection_steps: "選考ステップ",
    tasks: "タスク",
    es_questions: "ESの設問",
    interview_notes: "面接記録",
  }[table];
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={title + (item ? "を編集" : "を追加")}
      description={
        application?.company_name ?? "企業を選んで登録してください。"
      }
    >
      <form className="form-grid" onSubmit={submit}>
        {!application && (
          <label className="span-2">
            企業
            <select
              name="user_application_id"
              required
              defaultValue={value("user_application_id")}
            >
              {applications?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company_name} · {a.position_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(table === "selection_steps" || table === "tasks") && (
          <>
            <label className="span-2">
              タスク名
              <input
                name="title"
                required
                maxLength={300}
                defaultValue={value("title")}
                placeholder={
                  table === "tasks"
                    ? "例：ESの志望動機を仕上げる"
                    : "例：一次面接"
                }
              />
            </label>
            {table === "selection_steps" ? (
              <>
                <label>
                  種類
                  <select
                    name="step_type"
                    defaultValue={value("step_type") || "ES締切"}
                  >
                    {eventTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  表示順
                  <input
                    name="order_index"
                    type="number"
                    min="0"
                    defaultValue={value("order_index") || order}
                  />
                </label>
                <label>
                  期限
                  <input
                    type="date"
                    name="deadline"
                    defaultValue={value("deadline")}
                  />
                </label>
                <label>
                  実施日時（日本時間）
                  <input
                    type="datetime-local"
                    name="scheduled_at"
                    defaultValue={
                      value("scheduled_at")
                        ? toLocalInput(value("scheduled_at"))
                        : ""
                    }
                  />
                </label>
                <label className="span-2">
                  結果
                  <input
                    name="result"
                    defaultValue={value("result")}
                    placeholder="通過・不合格・結果待ちなど"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  種類
                  <select
                    name="task_type"
                    defaultValue={value("task_type") || "ESを書く"}
                  >
                    {[
                      "ESを書く",
                      "ES提出",
                      "Webテスト対策",
                      "Webテスト受験",
                      "面接準備",
                      "企業研究",
                      "OB訪問",
                      "面接",
                      "お礼メール",
                      "ポートフォリオ提出",
                      "その他",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  期限
                  <input
                    name="due_date"
                    type="date"
                    defaultValue={value("due_date")}
                  />
                </label>
              </>
            )}
            <label className="span-2">
              URL
              <input
                name="url"
                defaultValue={value("url")}
                placeholder="https://…"
              />
            </label>
            <label className="span-2">
              自分用メモ
              <textarea
                name="memo"
                rows={4}
                maxLength={20000}
                defaultValue={value("memo")}
              />
            </label>
          </>
        )}
        {table === "es_questions" && (
          <>
            <label className="span-2">
              設問
              <textarea
                name="question"
                required
                maxLength={2000}
                defaultValue={value("question")}
                placeholder="志望動機を教えてください"
              />
            </label>
            <label>
              文字数制限
              <input
                type="number"
                name="max_length"
                min="1"
                max="50000"
                required
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </label>
            <label>
              ステータス
              <select name="status" defaultValue={value("status") || "下書き"}>
                {["下書き", "完成", "提出済み"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="span-2">
              回答
              <textarea
                aria-label="回答"
                aria-describedby="answer-count"
                rows={10}
                name="answer"
                maxLength={100000}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <small
                id="answer-count"
                className={
                  Array.from(answer).length > max ? "field-error" : "muted"
                }
              >
                {Array.from(answer).length} / {max} 文字
                {Array.from(answer).length > max &&
                  "（文字数制限を超えています）"}
              </small>
            </label>
          </>
        )}
        {table === "interview_notes" && (
          <>
            <label>
              面接日時（日本時間）
              <input
                type="datetime-local"
                name="scheduled_at"
                required
                defaultValue={
                  value("scheduled_at")
                    ? toLocalInput(value("scheduled_at"))
                    : ""
                }
              />
            </label>
            <label>
              面接形式
              <select
                name="format"
                defaultValue={value("format") || "オンライン"}
              >
                <option>オンライン</option>
                <option>対面</option>
              </select>
            </label>
            <label>
              選考段階
              <input
                name="stage"
                required
                defaultValue={value("stage")}
                placeholder="一次面接"
              />
            </label>
            <label>
              面接官
              <input name="interviewer" defaultValue={value("interviewer")} />
            </label>
            {[
              ["questions", "質問"],
              ["answers", "自分の回答"],
              ["reflection", "振り返り"],
            ].map(([k, l]) => (
              <label className="span-2" key={k}>
                {l}
                <textarea
                  name={k}
                  rows={4}
                  maxLength={20000}
                  defaultValue={value(k)}
                />
              </label>
            ))}
            <label className="span-2">
              結果
              <input name="result" defaultValue={value("result")} />
            </label>
          </>
        )}
        {validation && (
          <p role="alert" className="field-error span-2">
            {validation}
          </p>
        )}
        <div className="form-footer span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={action.busy} type="submit">
            {action.busy ? "保存中…" : "保存する"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
