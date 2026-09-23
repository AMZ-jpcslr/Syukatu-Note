"use client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import luxonPlugin from "@fullcalendar/luxon3";
import listPlugin from "@fullcalendar/list";
import jaLocale from "@fullcalendar/core/locales/ja";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { eventsFromStore, eventClass } from "@/lib/dates";
import { useStore } from "./providers";
import { Empty, ErrorState, Loading, PageHeading } from "./shared";
import { ApplicationForm } from "./application-form";
import { Button } from "./ui/button";
export function Calendar() {
  const { data, error, isPending, refetch } = useStore();
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageHeading
        eyebrow="YOUR SCHEDULE"
        title="カレンダー"
        description="応募から面接まで。次の予定を見渡そう。"
      >
        <Button onClick={() => setAdd(true)}>
          <Plus size={16} />
          企業を追加
        </Button>
      </PageHeading>
      <div className="calendar-legend">
        {[
          ["opening", "応募開始"],
          ["deadline", "応募締切"],
          ["es", "ES"],
          ["test", "Webテスト"],
          ["interview", "面接・GD"],
          ["intern", "インターン"],
          ["other", "説明会・その他"],
        ].map(([c, n]) => (
          <span key={c}>
            <i className={`event-${c}`} />
            {n}
          </span>
        ))}
        <label className="ml-auto inline-flex gap-2 items-center">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          完了済みを表示
        </label>
      </div>
      <section className="panel calendar-panel">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, luxonPlugin]}
          initialView="dayGridMonth"
          locale={jaLocale}
          timeZone="Asia/Tokyo"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listMonth",
          }}
          buttonText={{
            today: "今日",
            month: "月",
            week: "週",
            list: "リスト",
          }}
          firstDay={1}
          height="auto"
          dayMaxEvents={3}
          nowIndicator
          allDayText="終日"
          slotMinTime="07:00:00"
          slotMaxTime="23:00:00"
          events={eventsFromStore(data)
            .filter((e) => showCompleted || !e.completed)
            .map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              allDay: e.allDay,
              classNames: [
                `event-${eventClass(e.type)}`,
                e.completed ? "event-completed" : "",
              ],
              extendedProps: { applicationId: e.applicationId },
            }))}
          eventClick={(info) =>
            router.push(`/companies/${info.event.extendedProps.applicationId}`)
          }
          eventDidMount={(info) => {
            info.el.title = info.event.title;
            info.el.setAttribute("tabindex", "0");
            info.el.setAttribute("role", "link");
            info.el.addEventListener("keydown", (e) => {
              if (e.key === "Enter")
                router.push(
                  `/companies/${info.event.extendedProps.applicationId}`,
                );
            });
          }}
        />
        {data.applications.length === 0 && (
          <Empty text="企業やタスクの日程がここに表示されます" />
        )}
      </section>
      <p className="muted text-xs mt-3">
        すべて日本時間（JST）で表示しています。予定を選ぶと企業詳細を開きます。
      </p>
      <ApplicationForm open={add} onClose={() => setAdd(false)} />
    </>
  );
}
