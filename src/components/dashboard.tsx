"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Clock3,
  CheckCheck,
  Flag,
  CalendarDays,
  Circle,
  Check,
  ChevronRight,
} from "lucide-react";
import { useStore, useAction } from "./providers";
import { saveChild } from "@/lib/repository";
import {
  eventsFromStore,
  daysUntil,
  progress,
  displayDate,
  jstTime,
  todayKey,
} from "@/lib/dates";
import { statuses, priorities } from "@/lib/types";
import { Button } from "./ui/button";
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
export function Dashboard() {
  const { data, error, isPending, refetch } = useStore();
  const [add, setAdd] = useState(false);
  const action = useAction();
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  const events = eventsFromStore(data);
  const soon = events.filter(
    (e) => !e.completed && daysUntil(e.start) >= 0 && daysUntil(e.start) <= 7,
  );
  const todayTasks = data.tasks.filter(
    (t) => t.due_date && daysUntil(t.due_date) === 0,
  );
  const todaySteps = data.steps.filter(
    (t) =>
      (t.deadline && daysUntil(t.deadline) === 0) ||
      (t.scheduled_at && daysUntil(t.scheduled_at) === 0),
  );
  const handledIds = new Set([
    ...todayTasks.map((t) => t.id),
    ...todaySteps.flatMap((t) => [t.id + "-due", t.id + "-at"]),
  ]);
  const otherToday = events.filter(
    (e) =>
      daysUntil(e.start) === 0 &&
      !e.completed &&
      !handledIds.has(e.id) &&
      e.type !== "応募開始",
  );
  const todayCount =
    otherToday.length +
    [...todayTasks, ...todaySteps].filter((t) => !t.completed).length;
  const deadlines = soon.filter((e) => e.allDay && e.type !== "応募開始");
  const selections = soon.filter((e) =>
    [
      "一次面接",
      "二次面接",
      "最終面接",
      "Webテスト",
      "インターン",
      "GD",
    ].includes(e.type),
  );
  const pending = data.applications
    .filter((a) => ["検討中", "応募予定"].includes(a.status))
    .sort((a, b) =>
      (a.application_deadline ?? "9999").localeCompare(
        b.application_deadline ?? "9999",
      ),
    );
  const overdue = events.filter(
    (e) => !e.completed && e.type !== "応募開始" && daysUntil(e.start) < 0,
  );
  const industries = Object.entries(
    data.applications.reduce<Record<string, number>>(
      (acc, a) => ({
        ...acc,
        [a.industry || "未設定"]: (acc[a.industry || "未設定"] ?? 0) + 1,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
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
      <div className="stats-grid">
        {[
          {
            label: "管理している企業",
            value: data.applications.length,
            unit: "社",
            icon: Building2,
            note: "あなたの可能性を広げよう",
            href: "/companies",
          },
          {
            label: "今週の締切",
            value: deadlines.length,
            unit: "件",
            icon: Clock3,
            note: "7日以内に対応すること",
            href: "/calendar",
          },
          {
            label: "選考中の企業",
            value: data.applications.filter((a) => a.status === "選考中")
              .length,
            unit: "社",
            icon: CheckCheck,
            note: "次のステップへ進もう",
            href: "/companies?status=選考中",
          },
          {
            label: "内定",
            value: data.applications.filter((a) => a.status === "内定").length,
            unit: "社",
            icon: Flag,
            note: "これまでの積み重ね",
            href: "/companies?status=内定",
          },
        ].map(({ label, value, unit, icon: Icon, note, href }, i) => (
          <Link href={href} key={label} className="stat-card">
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong className={i === 1 && value > 0 ? "text-warning" : ""}>
              {value}
              <small>{unit}</small>
            </strong>
            <p>
              {note}
              <ArrowUpRight size={13} />
            </p>
          </Link>
        ))}
      </div>
      {overdue.length > 0 && (
        <Link className="overdue-notice" href="/tasks">
          期限を過ぎた未完了の予定が {overdue.length}{" "}
          件あります。タスクとカレンダーを確認してください。
          <ArrowRight size={15} />
        </Link>
      )}
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="panel today-panel">
            <div className="panel-heading">
              <h2>
                <span className="section-dot" />
                今日やること<span className="count-pill">{todayCount}</span>
              </h2>
              <span className="muted text-xs">
                {displayDate(todayKey(), "M月d日")}・TODAY
              </span>
            </div>
            <div className="task-list">
              {todayTasks.map((t) => (
                <div className="task-row" key={t.id}>
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
                  <Link
                    href={`/companies/${t.user_application_id}`}
                    className={t.completed ? "line-through muted" : ""}
                  >
                    <strong>{t.title}</strong>
                    <small>
                      {
                        data.applications.find(
                          (a) => a.id === t.user_application_id,
                        )?.company_name
                      }{" "}
                      <span>· {t.task_type}</span>
                    </small>
                  </Link>
                  <span className="today-label">今日</span>
                </div>
              ))}
              {todaySteps.map((s) => (
                <div className="task-row" key={s.id}>
                  <button
                    aria-label={`${s.title}を${s.completed ? "未完了" : "完了"}にする`}
                    disabled={action.busy}
                    className={`task-check ${s.completed ? "checked" : ""}`}
                    onClick={() =>
                      action.run(() =>
                        saveChild("selection_steps", {
                          ...s,
                          completed: !s.completed,
                        }),
                      )
                    }
                  >
                    {s.completed && <Check size={12} />}
                  </button>
                  <Link href={`/companies/${s.user_application_id}`}>
                    <strong className={s.completed ? "line-through muted" : ""}>
                      {s.title}
                    </strong>
                    <small>
                      {
                        data.applications.find(
                          (a) => a.id === s.user_application_id,
                        )?.company_name
                      }{" "}
                      · {s.step_type}
                    </small>
                  </Link>
                  <span className="today-label">
                    {s.scheduled_at ? jstTime(s.scheduled_at) : "今日"}
                  </span>
                </div>
              ))}
              {otherToday.map((e) => (
                <Link
                  key={e.id}
                  href={`/companies/${e.applicationId}`}
                  className="task-row"
                >
                  <CalendarDays size={17} className="muted" />
                  <div className="flex-1">
                    <strong>{e.title}</strong>
                    <small>{e.type}</small>
                  </div>
                  <span className="today-label">
                    {e.allDay ? "今日" : jstTime(e.start)}
                  </span>
                </Link>
              ))}
              {todayTasks.length + todaySteps.length + otherToday.length ===
                0 && (
                <Empty text="今日のタスクはありません。次の準備を進めましょう。" />
              )}
            </div>
            <Link href="/tasks" className="panel-bottom-link">
              すべてのタスクを見る
              <ArrowRight size={14} />
            </Link>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                今週の締切<span className="count-pill">{deadlines.length}</span>
              </h2>
              <Link href="/calendar" className="text-link">
                カレンダーへ
                <ArrowUpRight size={14} />
              </Link>
            </div>
            {deadlines.length ? (
              <div className="deadline-list">
                {deadlines.slice(0, 6).map((e) => {
                  const a = data.applications.find(
                    (a) => a.id === e.applicationId,
                  )!;
                  return (
                    <Link
                      key={e.id}
                      className="deadline-row"
                      href={`/companies/${a.id}`}
                    >
                      <CompanyMark name={a.company_name} small />
                      <div>
                        <strong>{a.company_name}</strong>
                        <small>
                          {e.title.split(" · ").slice(1).join(" · ")}
                        </small>
                      </div>
                      <DueBadge date={e.start} />
                      <ChevronRight size={15} className="muted" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty text="今週の締切はありません" />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>次に応募する企業</h2>
              <Link href="/companies" className="text-link">
                すべて見る
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>企業 / 募集</th>
                    <th>締切</th>
                    <th>ステータス</th>
                    <th>進捗</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 4).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link
                          className="company-cell"
                          href={`/companies/${a.id}`}
                        >
                          <CompanyMark name={a.company_name} small />
                          <div>
                            <strong>{a.company_name}</strong>
                            <small>{a.job_category}</small>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <DueBadge date={a.application_deadline} />
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td>
                        <Progress {...progress(data, a.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pending.length === 0 && (
                <Empty text="応募予定の企業はありません" />
              )}
            </div>
          </section>
        </div>
        <aside className="dashboard-secondary">
          <section className="panel">
            <div className="panel-heading">
              <h2>直近の選考</h2>
              <span className="muted text-xs">7 DAYS</span>
            </div>
            <div className="timeline">
              {selections.slice(0, 4).map((e) => (
                <Link
                  href={`/companies/${e.applicationId}`}
                  key={e.id}
                  className="timeline-item"
                >
                  <span className="timeline-dot" />
                  <p>
                    {displayDate(e.start, "M月d日")}
                    {!e.allDay && <span> · {jstTime(e.start)}</span>}
                  </p>
                  <strong>
                    {
                      data.applications.find((a) => a.id === e.applicationId)
                        ?.company_name
                    }
                  </strong>
                  <small>{e.type}</small>
                </Link>
              ))}
              {selections.length === 0 && (
                <Empty text="直近の選考はありません" />
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>選考ステータス</h2>
              <span className="muted text-xs">
                {data.applications.length}社
              </span>
            </div>
            <div className="status-summary">
              {statuses.map((s, i) => {
                const count = data.applications.filter(
                  (a) => a.status === s,
                ).length;
                return (
                  <div key={s}>
                    <span>
                      <i style={{ opacity: 1 - i * 0.1 }} />
                      {s}
                    </span>
                    <strong>
                      {count}
                      <small>社</small>
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="discover-card">
            <div className="flex justify-between items-center">
              <span className="eyebrow">SHARED KNOWLEDGE</span>
              <ArrowUpRight size={18} />
            </div>
            <h3>
              まだ知らない企業と
              <br />
              出会おう。
            </h3>
            <p>
              みんなの募集情報から、
              <br />
              自分の選択肢を広げる。
            </p>
            <Link href="/templates">
              みんなの募集を見る
              <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
      <div className="bottom-stats">
        <section className="panel">
          <div className="panel-heading">
            <h2>業界別の応募状況</h2>
          </div>
          <div className="industry-bars">
            {industries.map(([name, n]) => (
              <div key={name}>
                <span>{name}</span>
                <div>
                  <i
                    style={{
                      width: `${(n / Math.max(data.applications.length, 1)) * 100}%`,
                    }}
                  />
                </div>
                <strong>{n}</strong>
              </div>
            ))}
            {!industries.length && (
              <p className="muted">企業を追加すると表示されます</p>
            )}
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
                  <small>社</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <ApplicationForm open={add} onClose={() => setAdd(false)} />
    </>
  );
}
