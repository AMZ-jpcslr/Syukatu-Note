"use client";
import { RecruitmentNotice } from "./recruitment-monitor";
import Link from "next/link";
import { useState } from "react";
import { Plus, CalendarDays, Check } from "lucide-react";
import { useStore, useTemplates, useAction } from "./providers";
import { applyTemplateDeadline, saveChild } from "@/lib/repository";
import { deadlineLabel } from "@/lib/applications";
import { deadlineChanged } from "@/lib/templates";
import {
  eventsFromStore,
  daysUntil,
  displayDate,
  jstTime,
  progress,
} from "@/lib/dates";
import {
  statuses,
  priorities,
  applicationStatusLabels,
  type CalendarEvent,
  type Application,
  type Template,
} from "@/lib/types";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { ApplicationForm } from "./application-form";
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
function ScheduleList({
  title,
  events,
  deadline = false,
}: {
  title: string;
  events: CalendarEvent[];
  deadline?: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          {title}
          <span className="count-pill">{events.length}</span>
        </h2>
        <Link className="text-link" href="/calendar">
          カレンダーへ
        </Link>
      </div>
      {events.slice(0, 8).map((e) => (
        <Link
          className="deadline-row"
          href={`/companies/${e.applicationId}`}
          key={e.id}
        >
          <CalendarDays size={16} />
          <div>
            <strong>{e.title}</strong>
            <small>{e.type}</small>
          </div>
          {deadline ? (
            <DueBadge date={e.start} />
          ) : (
            <span className="text-xs">
              {displayDate(e.start)}
              {!e.allDay && ` ${jstTime(e.start)}`}
            </span>
          )}
        </Link>
      ))}
      {events.length > 8 && (
        <Link href="/calendar" className="panel-bottom-link">
          残り{events.length - 8}件を見る
        </Link>
      )}
      {!events.length && <Empty text="該当する予定はありません" />}
    </section>
  );
}
export function Dashboard() {
  const { data, error, isPending, refetch } = useStore();
  const templates = useTemplates();
  const [add, setAdd] = useState(false);
  const [update, setUpdate] = useState<{ a: Application; t: Template }>();
  const action = useAction();
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const events = eventsFromStore(data).filter((e) => !e.completed);
  const soon = events.filter(
    (e) => daysUntil(e.start) >= 0 && daysUntil(e.start) <= 7,
  );
  const urgent = soon.filter(
    (e) => e.allDay && e.type !== "応募開始" && daysUntil(e.start) <= 3,
  );
  const selections = events.filter(
    (e) =>
      daysUntil(e.start) >= 0 &&
      [
        "一次面接",
        "二次面接",
        "最終面接",
        "Webテスト",
        "インターン",
        "GD",
      ].includes(e.type),
  );
  const overdue = events.filter(
    (e) => e.type !== "応募開始" && daysUntil(e.start) < 0,
  );
  const todayTasks = data.tasks.filter(
    (t) => !t.completed && t.due_date && daysUntil(t.due_date) === 0,
  );
  const todaySteps = data.steps.filter(
    (s) =>
      !s.completed &&
      ((s.deadline && daysUntil(s.deadline) === 0) ||
        (s.scheduled_at && daysUntil(s.scheduled_at) === 0)) &&
      !todayTasks.some((t) => t.selection_step_id === s.id),
  );
  const handled = new Set([
    ...todayTasks.flatMap((t) => [
      t.id,
      ...(t.selection_step_id
        ? [`${t.selection_step_id}-due`, `${t.selection_step_id}-at`]
        : []),
    ]),
    ...todaySteps.flatMap((s) => [`${s.id}-due`, `${s.id}-at`]),
  ]);
  const otherToday = events.filter(
    (e) =>
      daysUntil(e.start) === 0 && !handled.has(e.id) && e.type !== "応募開始",
  );
  const publicTemplates = (templates.data ?? []).filter(
    (t) => t.public && !!t.url,
  );
  const updates = data.applications.flatMap((a) => {
    const t = publicTemplates.find((t) => t.id === a.recruitment_template_id);
    return t && deadlineChanged(a, t) ? [{ a, t }] : [];
  });
  const watched = publicTemplates.filter((t) =>
    data.watchlist?.some((w) => w.recruitment_template_id === t.id),
  );
  const appList = (title: string, items: Application[]) => (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          {title}
          <span className="count-pill">{items.length}</span>
        </h2>
        <Link href="/companies" className="text-link">
          企業一覧へ
        </Link>
      </div>
      {items.slice(0, 6).map((a) => (
        <Link className="deadline-row" href={`/companies/${a.id}`} key={a.id}>
          <CompanyMark name={a.company_name} small />
          <div>
            <strong>{a.company_name}</strong>
            <small>{a.position_name || a.job_category}</small>
          </div>
          <StatusBadge status={a.status} />
          <Progress {...progress(data, a.id)} />
        </Link>
      ))}
      {items.length > 6 && (
        <Link href="/companies" className="panel-bottom-link">
          残り{items.length - 6}件の募集を見る
        </Link>
      )}
      {!items.length && <Empty text="まだ登録されていません" />}
    </section>
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT CHAPTER"
        title="一歩ずつ、未来へ。"
        description="今日のアクションと、これからの予定を確認しましょう。"
      >
        <Button variant="outline" asChild>
          <Link href="/calendar">
            <CalendarDays size={16} />
            カレンダー
          </Link>
        </Button>
        <Button onClick={() => setAdd(true)}>
          <Plus size={16} />
          企業を追加
        </Button>
      </PageHeading>
      <RecruitmentNotice />
      {!!overdue.length && (
        <Link href="/calendar" className="overdue-notice">
          期限超過の未完了予定が{overdue.length}
          件あります。カレンダーで確認してください。
        </Link>
      )}
      <div className="dashboard-v11">
        <section className="panel today-panel">
          <div className="panel-heading">
            <h2>
              <span className="section-dot" />
              今日やること
              <span className="count-pill">
                {todayTasks.length + todaySteps.length + otherToday.length}
              </span>
            </h2>
          </div>
          {[
            ...todayTasks.map((t) => ({ item: t, table: "tasks" as const })),
            ...todaySteps.map((s) => ({
              item: s,
              table: "selection_steps" as const,
            })),
          ].map(({ item, table }) => (
            <div className="task-row" key={item.id}>
              <button
                className="task-check"
                aria-label={`${item.title}を完了にする`}
                disabled={action.busy}
                onClick={() =>
                  action.run(() =>
                    saveChild(table, { ...item, completed: true }),
                  )
                }
              >
                {item.completed && <Check size={12} />}
              </button>
              <Link href={`/companies/${item.user_application_id}`}>
                <strong>{item.title}</strong>
                <small>
                  {
                    data.applications.find(
                      (a) => a.id === item.user_application_id,
                    )?.company_name
                  }
                </small>
              </Link>
              <span className="today-label">今日</span>
            </div>
          ))}
          {otherToday.map((e) => (
            <Link
              className="task-row"
              href={`/companies/${e.applicationId}`}
              key={e.id}
            >
              <CalendarDays size={15} />
              <strong>{e.title}</strong>
              <span className="today-label">
                {e.allDay ? "今日締切" : jstTime(e.start)}
              </span>
            </Link>
          ))}
          {!todayTasks.length && !todaySteps.length && !otherToday.length && (
            <Empty text="今日のタスクはありません。次の準備を進めましょう。" />
          )}
          <Link href="/tasks" className="panel-bottom-link">
            すべてのタスクを見る
          </Link>
        </section>
        <ScheduleList title="締切まで3日以内" events={urgent} deadline />
        <ScheduleList title="今週の予定" events={soon} />
        <ScheduleList title="次の選考" events={selections} />
        {appList(
          "応募予定企業",
          data.applications
            .filter(
              (a) =>
                a.application_status !== "closed" &&
                ["検討中", "応募予定"].includes(a.status),
            )
            .sort((a, b) =>
              (a.application_deadline ?? "9999").localeCompare(
                b.application_deadline ?? "9999",
              ),
            ),
        )}
        {appList(
          "選考中企業",
          data.applications.filter((a) => a.status === "選考中"),
        )}
        {appList(
          "内定",
          data.applications.filter((a) => a.status === "内定"),
        )}
        <section className="panel">
          <div className="panel-heading">
            <h2>最近追加された公開募集</h2>
            <Link className="text-link" href="/templates">
              募集を探す
            </Link>
          </div>
          {templates.error ? (
            <p role="alert" className="p-5 muted">
              募集情報を取得できませんでした。
              <button className="text-link" onClick={() => templates.refetch()}>
                再試行
              </button>
            </p>
          ) : (
            publicTemplates.slice(0, 5).map((t) => (
              <Link
                href={`/templates#template-${t.id}`}
                key={t.id}
                className="deadline-row"
              >
                <CompanyMark small name={t.company_name} />
                <div>
                  <strong>{t.company_name}</strong>
                  <small>
                    {t.position_name} · {t.selection_type}
                  </small>
                </div>
                <span className="tag">
                  {applicationStatusLabels[t.application_status ?? "unknown"]}
                </span>
              </Link>
            ))
          )}
          {!templates.isPending &&
            !templates.error &&
            !publicTemplates.length && (
              <Empty text="公開募集はまだありません" />
            )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>気になる企業</h2>
          </div>
          {watched.map((t) => (
            <Link
              href={`/templates#template-${t.id}`}
              key={t.id}
              className="deadline-row"
            >
              <CompanyMark small name={t.company_name} />
              <div>
                <strong>{t.company_name}</strong>
                <small>{t.position_name}</small>
              </div>
            </Link>
          ))}
          {!watched.length && (
            <Empty text="募集を探す画面の「☆ 気になる」から保存できます" />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>募集情報の更新</h2>
          </div>
          {updates.map(({ a, t }) => (
            <div className="deadline-row" key={a.id}>
              <div>
                <strong>{a.company_name}：募集情報が更新されています</strong>
                <small>
                  コピー時{" "}
                  {deadlineLabel(
                    {
                      application_deadline:
                        a.copied_application_deadline ?? null,
                      deadline_type: a.copied_deadline_type,
                    },
                    "yyyy-MM-dd",
                  )}{" "}
                  → 公開募集 {deadlineLabel(t, "yyyy-MM-dd")}
                </small>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUpdate({ a, t })}
              >
                更新を反映
              </Button>
            </div>
          ))}
          {!updates.length && <Empty text="確認できる締切の変更はありません" />}
        </section>
      </div>
      <div className="bottom-stats">
        <section className="panel">
          <div className="panel-heading">
            <h2>選考状況</h2>
          </div>
          <div className="status-summary">
            {statuses.map((s) => (
              <div key={s}>
                <span>{s}</span>
                <strong>
                  {data.applications.filter((a) => a.status === s).length}件
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>志望度別</h2>
          </div>
          <div className="priority-summary">
            {priorities.map((p) => (
              <div key={p}>
                <span>{p}</span>
                <strong>
                  {data.applications.filter((a) => a.priority === p).length}
                  <small>件</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>業界別の応募状況</h2>
          </div>
          <div className="status-summary">
            {[
              ...new Set(data.applications.map((a) => a.industry || "未設定")),
            ].map((i) => (
              <div key={i}>
                <span>{i}</span>
                <strong>
                  {
                    data.applications.filter(
                      (a) => (a.industry || "未設定") === i,
                    ).length
                  }
                  件
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <ApplicationForm open={add} onClose={() => setAdd(false)} />
      <Dialog
        open={!!update}
        onOpenChange={(open) => !open && setUpdate(undefined)}
        title="締切の更新を反映しますか？"
        description={
          update
            ? `${update.a.company_name}：あなたの締切 ${deadlineLabel(update.a, "yyyy-MM-dd")} を ${deadlineLabel(update.t, "yyyy-MM-dd")} に変更します。`
            : ""
        }
      >
        <p className="muted text-sm">
          個別に調整した締切も、この操作で置き換わります。
        </p>
        <div className="form-footer">
          <Button variant="outline" onClick={() => setUpdate(undefined)}>
            キャンセル
          </Button>
          <Button
            disabled={action.busy}
            onClick={async () => {
              if (
                update &&
                (await action.run(() =>
                  applyTemplateDeadline(update.a, update.t),
                ))
              )
                setUpdate(undefined);
            }}
          >
            この締切を反映
          </Button>
        </div>
      </Dialog>
    </>
  );
}
