"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Copy, Flag } from "lucide-react";
import {
  type Template,
  applicationStatusLabels,
  verificationLabels,
  priorities,
} from "@/lib/types";
import {
  copyTemplate,
  reportTemplate,
  setApplicationPriority,
  toggleWatchlist,
} from "@/lib/repository";
import { deadlineLabel } from "@/lib/applications";
import { displayDate } from "@/lib/dates";
import { useAction, useStore } from "./providers";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { CompanyMark, ExternalLink } from "./shared";

export function TemplateCopyButtons({
  template: t,
  compact = false,
  disabled = false,
}: {
  template: Template;
  compact?: boolean;
  disabled?: boolean;
}) {
  const action = useAction();
  const router = useRouter();
  const [added, setAdded] = useState<string>();
  const available = t.public && !!t.url;
  async function copy(edit: boolean) {
    await action.run(async () => {
      const id = await copyTemplate(t);
      if (edit) router.push(`/companies/${id}?edit=1`);
      else setAdded(id);
    }, "応募予定に追加しました");
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={disabled || action.busy || !available}
        onClick={() => copy(false)}
      >
        <Copy size={14} />
        {compact ? "この募集を追加" : "応募予定に追加"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || action.busy || !available}
        onClick={() => copy(true)}
      >
        コピーして編集
      </Button>
      <Dialog
        open={!!added}
        onOpenChange={(open) => {
          if (!open) setAdded(undefined);
        }}
        title="志望度を設定しますか？"
        description={`${t.company_name}を応募予定に追加しました。選考フローは自分用に編集できます。`}
      >
        <div className="flex gap-2 flex-wrap">
          {priorities
            .filter((p) => p !== "未設定")
            .map((p) => (
              <Button
                key={p}
                disabled={action.busy}
                variant="outline"
                onClick={() =>
                  action.run(async () => {
                    await setApplicationPriority(added!, p);
                    setAdded(undefined);
                  })
                }
              >
                {p}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setAdded(undefined)}>
            あとで
          </Button>
        </div>
      </Dialog>
    </>
  );
}
export function TemplateCard({
  template: t,
  children,
  copyDisabled = false,
}: {
  template: Template;
  children?: React.ReactNode;
  copyDisabled?: boolean;
}) {
  const { data } = useStore();
  const action = useAction();
  const [report, setReport] = useState(false);
  const watched = !!data?.watchlist?.some(
    (w) => w.recruitment_template_id === t.id,
  );
  return (
    <article className="panel template-card" id={`template-${t.id}`}>
      <div className="flex justify-between items-center">
        <CompanyMark name={t.company_name} />
        <span className="tag">{t.graduation_year}卒</span>
      </div>
      <h2>{t.company_name}</h2>
      <p>{t.position_name || "募集名未設定"}</p>
      <div className="flex gap-2 my-4 flex-wrap">
        <span className="tag">{t.selection_type}</span>
        <span className="tag">
          {applicationStatusLabels[t.application_status ?? "unknown"]}
        </span>
        <span className="tag">
          {verificationLabels[t.verification_status ?? "unverified"]}
        </span>
        {!t.public && <span className="tag">非公開</span>}
      </div>
      <dl className="detail-dl template-facts">
        <div>
          <dt>業界</dt>
          <dd>{t.industry || "未設定"}</dd>
        </div>
        <div>
          <dt>職種</dt>
          <dd>{t.job_category || "未発表"}</dd>
        </div>
        <div>
          <dt>応募開始</dt>
          <dd>
            {t.application_start
              ? displayDate(t.application_start, "yyyy/M/d")
              : "未発表"}
          </dd>
        </div>
        <div>
          <dt>締切</dt>
          <dd>
            {deadlineLabel(t)}{" "}
            {t.application_deadline_value?.includes("T") &&
              t.application_deadline_value.slice(11, 16)}
          </dd>
        </div>
        <div>
          <dt>情報元</dt>
          <dd>
            {
              {
                official: "公式採用サイト",
                company_mypage: "企業マイページ",
                third_party: "外部サイト",
                user_submitted: "ユーザー投稿（公式URLは投稿者申告）",
              }[t.source_type ?? "user_submitted"]
            }
          </dd>
        </div>
        <div>
          <dt>最終確認</dt>
          <dd>
            {t.last_verified_at
              ? displayDate(t.last_verified_at, "yyyy/M/d")
              : "未確認"}
          </dd>
        </div>
        <div>
          <dt>公式URL</dt>
          <dd>
            {t.url ? <ExternalLink url={t.url} /> : "未設定・共有利用不可"}
          </dd>
        </div>
      </dl>
      {t.source_url && (
        <a
          href={t.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link text-xs mt-3"
        >
          情報元を見る ↗
        </a>
      )}
      {!!t.tags?.length && (
        <div className="flex gap-1 flex-wrap mt-3">
          {t.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
      {t.notes_public && (
        <p className="muted text-xs mt-3 whitespace-pre-wrap">
          {t.notes_public}
        </p>
      )}
      {!!t.public_flow.length && (
        <p className="template-flow">
          {t.public_flow.map((s) => s.title).join(" → ")}
        </p>
      )}
      {!t.public_flow.length && (
        <p className="muted text-xs mt-3">
          選考フローは未発表。追加後に自分で設定できます。
        </p>
      )}
      <div className="template-actions flex-wrap">
        <TemplateCopyButtons template={t} disabled={copyDisabled} />
        {children}
      </div>
      <div className="flex gap-3 mt-3 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={watched}
          disabled={action.busy}
          onClick={() =>
            action.run(
              () => toggleWatchlist(t.id, !watched),
              watched ? "保存を解除しました" : "気になる企業に保存しました",
            )
          }
        >
          <Star size={14} fill={watched ? "currentColor" : "none"} />
          {watched ? "保存済み" : "気になる"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setReport(true)}>
          <Flag size={14} />
          情報が違う
        </Button>
      </div>
      <Dialog
        open={report}
        onOpenChange={setReport}
        title="情報の訂正を報告"
        description="報告内容は公開されません。運営が確認するための記録として保存します。"
      >
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (
              await action.run(
                () =>
                  reportTemplate(
                    t.id,
                    String(fd.get("type")),
                    String(fd.get("comment")),
                  ),
                "報告を保存しました",
              )
            )
              setReport(false);
          }}
        >
          <label className="span-2">
            訂正内容
            <select name="type">
              {["締切が違う", "URLが違う", "募集終了", "その他"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="span-2">
            補足（個人情報は入力しないでください）
            <textarea name="comment" rows={3} maxLength={2000} />
          </label>
          <div className="form-footer span-2">
            <Button disabled={action.busy} type="submit">
              報告する
            </Button>
          </div>
        </form>
      </Dialog>
    </article>
  );
}
