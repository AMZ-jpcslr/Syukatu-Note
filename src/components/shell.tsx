"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CheckSquare,
  Settings,
  Library,
  Plus,
  ArrowUpRight,
  Bell,
  PanelLeftClose,
  CircleHelp,
  Command,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { isDemo } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  todayKey,
  displayDate,
  eventsFromStore,
  reminders,
  daysUntil,
  jstTime,
} from "@/lib/dates";
import { useStore } from "./providers";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { ApplicationForm } from "./application-form";
const nav = [
  { href: "/", label: "ホーム", icon: LayoutDashboard },
  { href: "/companies", label: "企業一覧", icon: Building2 },
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/tasks", label: "タスク", icon: CheckSquare },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [add, setAdd] = useState(false);
  const [notice, setNotice] = useState(false);
  const { theme, setTheme } = useTheme();
  const { data } = useStore();
  const alerts = data ? reminders(eventsFromStore(data)) : [];
  const active = (href: string) =>
    href === "/" ? path === href : path.startsWith(href);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Command size={22} />
          </span>
          <span>
            しゅうかつ手帳<small>CAREER WORKSPACE</small>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">MY</span>
          <div>
            マイワークスペース<small>あなたのペースで、一歩ずつ。</small>
          </div>
          <PanelLeftClose size={15} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={cn("nav-item", active(href) && "active")}
              href={href}
            >
              <Icon size={18} />
              {label}
              {href === "/companies" && data && (
                <span className="nav-count">{data.applications.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <p className="nav-caption mt-8">DISCOVER</p>
        <Link
          href="/templates"
          className={cn("nav-item", active("/templates") && "active")}
        >
          <Library size={18} />
          募集を探す
          <ArrowUpRight size={14} className="ml-auto" />
        </Link>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <span className="live-dot" />
            登録なしではじめられます<p>予定もメモも、あなただけのもの。</p>
          </div>
          <Link
            href="/settings"
            className={cn("nav-item", active("/settings") && "active")}
          >
            <Settings size={18} />
            設定・データ管理
          </Link>
          <div className="sidebar-footer">
            <span>SHUKATSU NOTE</span>
            <span>v1.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>マイワークスペース</span>
            <span>/</span>
            <strong>
              {[
                ...nav,
                { href: "/templates", label: "募集を探す" },
                { href: "/settings", label: "設定" },
              ].find((n) => active(n.href))?.label ?? "企業詳細"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="date-today">
              {displayDate(todayKey(), "yyyy年 M月d日")}
            </span>
            {isDemo && <span className="demo-badge">DEMO</span>}
            <button
              className="icon-button"
              aria-label="テーマ切り替え"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun size={17} className="dark:hidden" />
              <Moon size={17} className="hidden dark:block" />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="通知を開く"
              onClick={() => setNotice(true)}
            >
              <Bell size={18} />
              {alerts.length > 0 && <i />}
            </button>
            <span className="user-avatar">Y</span>
          </div>
        </header>
        {isDemo && (
          <div className="demo-strip">
            デモワークスペース ·
            日程は架空です。変更はこのブラウザに保存されます。
          </div>
        )}
        <main>{children}</main>
        <footer className="main-footer">
          <CircleHelp size={13} />
          <span>
            このブラウザを削除するとデータへアクセスできなくなる可能性があります。
          </span>
          <Link href="/settings">
            引き継ぎコードを確認
            <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
      <button
        className="mobile-add"
        aria-label="企業を追加"
        onClick={() => setAdd(true)}
      >
        <Plus size={22} />
      </button>
      <nav className="mobile-nav">
        {[...nav, { href: "/settings", label: "設定", icon: Settings }].map(
          ({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={active(href) ? "active" : ""}
              href={href}
            >
              <Icon size={19} />
              <span>{label === "企業一覧" ? "企業" : label}</span>
            </Link>
          ),
        )}
      </nav>
      <ApplicationForm open={add} onClose={() => setAdd(false)} />
      <Dialog
        open={notice}
        onOpenChange={setNotice}
        title="通知"
        description="7日前・3日前・前日・当日の予定です。"
      >
        {alerts.length ? (
          alerts.map((e) => (
            <Link
              onClick={() => setNotice(false)}
              className="notification-row"
              key={e.id}
              href={`/companies/${e.applicationId}`}
            >
              <CalendarDays size={17} />
              <div>
                {e.title}
                <small>
                  {daysUntil(e.start) === 0
                    ? "本日"
                    : daysUntil(e.start) === 1
                      ? "明日"
                      : `あと${daysUntil(e.start)}日`}
                  {!e.allDay && ` · ${jstTime(e.start)}`}
                </small>
              </div>
              <ArrowUpRight size={15} />
            </Link>
          ))
        ) : (
          <p className="muted py-8 text-center">新しい通知はありません。</p>
        )}
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings" onClick={() => setNotice(false)}>
            通知設定
          </Link>
        </Button>
      </Dialog>
    </div>
  );
}
