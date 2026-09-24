"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useStore, useAction } from "./providers";
import { PageHeading, Loading } from "./shared";
import { Button } from "./ui/button";
import { planToday, matchProfile, emptyProfile } from "@/lib/import/planner";
import { loadProfile } from "@/lib/import/client";
import { saveChild } from "@/lib/repository";
import type { Application } from "@/lib/types";
export function TodayPlanner() {
  const { data } = useStore(),
    action = useAction();
  const [budget, setBudget] = useState(120);
  if (!data) return <Loading />;
  const plan = planToday(data.tasks, data.applications, budget);
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT ACTION"
        title="今日は何をすればいい？"
        description="締切・志望度・選考状況から、使える時間に収まるタスクを選びます。AIなしで動作します。"
      />
      <label className="block mb-5">
        使える時間（分）
        <input
          className="ml-3"
          aria-label="使える時間"
          type="number"
          min={0}
          max={1440}
          value={budget}
          onChange={(e) =>
            setBudget(Math.max(0, Math.min(1440, Number(e.target.value))))
          }
        />
      </label>
      <div className="panel p-5">
        <h2 className="font-semibold mb-3">
          今日のプラン · {plan.used}分 / {budget}分
        </h2>
        {plan.selected.map((r, i) => (
          <div key={r.task.id} className="border-b py-4 flex gap-4 items-start">
            <span>{i + 1}</span>
            <div className="grow">
              <Link
                className="text-link"
                href={"/companies/" + r.task.user_application_id}
              >
                {r.application?.company_name} · {r.task.title}
              </Link>
              <p className="muted text-xs mt-2">
                {r.reasons.join(" · ")} · 優先スコア {r.score}
              </p>
              <label className="text-sm">
                所要時間{" "}
                <input
                  aria-label={r.task.title + "の所要時間"}
                  className="w-20 my-2"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={r.minutes}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= 1440)
                      action.run(() =>
                        saveChild("tasks", { ...r.task, estimated_minutes: n }),
                      );
                  }}
                />{" "}
                分
              </label>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={action.busy}
              onClick={() =>
                action.run(() =>
                  saveChild("tasks", { ...r.task, completed: true }),
                )
              }
            >
              完了
            </Button>
          </div>
        ))}
        {!plan.selected.length && (
          <p className="muted">
            時間内に収まる未完了タスクがありません。所要時間か使える時間を調整してください。
          </p>
        )}
      </div>
      <section className="panel p-5 mt-5">
        <h2>時間に収まらなかったタスク {plan.deferred.length}件</h2>
        {plan.deferred.map((r) => (
          <p key={r.task.id} className="my-3">
            {r.application?.company_name} · {r.task.title}（{r.minutes}分）
            <span className="muted text-xs"> {r.reasons.join(" · ")}</span>
          </p>
        ))}
      </section>
    </>
  );
}
export function ProfileMatch({ application }: { application: Application }) {
  const [open, setOpen] = useState(false);
  const profile = useQuery({ queryKey: ["profile"], queryFn: loadProfile });
  const matches = matchProfile(profile.data ?? emptyProfile, [
    ...application.tags,
    application.job_category,
  ]);
  return (
    <section className="panel p-4 mb-5">
      <Button variant="outline" onClick={() => setOpen(!open)}>
        自分との関連を見る
      </Button>
      {open && (
        <div className="mt-3">
          <p className="text-sm">
            一致した経験・関心：
            {matches.length
              ? matches.map((t) => "✓ " + t).join(" / ")
              : "一致するタグはまだありません"}
          </p>
          <p className="muted text-xs mt-2">
            登録したタグの一致を示します。適性や採用可能性の判定ではありません。
          </p>
          <Link className="text-link" href="/settings#profile">
            経験タグを編集 →
          </Link>
        </div>
      )}
    </section>
  );
}
