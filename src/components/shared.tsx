"use client";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Loader2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { displayDate, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
export function Loading() {
  return (
    <div className="empty-state">
      <Loader2 className="animate-spin" />
      <p>スケジュールを読み込んでいます…</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="empty-state">
      <AlertCircle />
      <h2>データを読み込めませんでした</h2>
      <p>
        {error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "接続を確認してください"}
      </p>
      <Button onClick={retry}>もう一度試す</Button>
      <Link href="/settings">設定を確認</Link>
    </div>
  );
}
export function Empty({
  text = "まだ登録されていません",
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state compact">
      <CalendarDays size={26} />
      <p>{text}</p>
      {children}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="muted mt-2">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}
export function CompanyMark({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span className={cn("company-mark", small && "small")}>
      {name.match(/[A-Za-z]/) ? name.slice(0, 2) : name.slice(0, 1)}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("status-badge", status === "内定" && "success")}>
      <span />
      {status}
    </span>
  );
}
export function DueBadge({ date }: { date: string | null }) {
  if (!date) return <span className="muted">未設定</span>;
  const days = daysUntil(date);
  return (
    <span
      className={cn(
        "due-badge",
        days < 0
          ? "past"
          : days === 0
            ? "urgent"
            : days <= 3
              ? "strong"
              : days <= 7
                ? "warning"
                : "",
      )}
    >
      <span>{displayDate(date, "M/d")}</span>
      {days >= 0 && days <= 7 && (
        <small>
          {days === 0 ? "今日" : days === 1 ? "明日" : `あと${days}日`}
        </small>
      )}
      {days < 0 && <small>期限超過</small>}
    </span>
  );
}
export function Progress({
  done,
  total,
  percent,
}: {
  done: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="progress-cell">
      <div>
        <span>
          {done} / {total}
        </span>
        <strong>{percent}%</strong>
      </div>
      <div className="progress-track">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
export function ExternalLink({ url }: { url: string }) {
  if (!/^https?:\/\//i.test(url)) return null;
  return (
    <Button asChild variant="outline" size="sm">
      <a href={url} target="_blank" rel="noopener noreferrer">
        募集ページを開く
        <ArrowUpRight size={14} />
      </a>
    </Button>
  );
}
