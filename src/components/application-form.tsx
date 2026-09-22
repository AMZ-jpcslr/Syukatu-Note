"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  applicationSchema,
  defaultApplication,
  type ApplicationInput,
} from "@/lib/validation";
import type { Application } from "@/lib/types";
import { selectionTypes, priorities, statuses } from "@/lib/types";
import { saveApplication, copyTemplate } from "@/lib/repository";
import { initializeUser } from "@/lib/supabase";
import { similarTemplates } from "@/lib/templates";
import { useAction, useTemplates } from "./providers";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
export function ApplicationForm({
  open,
  onClose,
  application,
}: {
  open: boolean;
  onClose: () => void;
  application?: Application;
}) {
  const { data: templates = [] } = useTemplates();
  const action = useAction();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: defaultApplication,
  });
  useEffect(() => {
    if (open)
      reset(
        application
          ? {
              ...application,
              application_start: application.application_start ?? "",
              application_deadline: application.application_deadline ?? "",
              tags: application.tags.join(", "),
            }
          : defaultApplication,
      );
  }, [open, application, reset]);
  const [name, year, job, position] = watch([
    "company_name",
    "graduation_year",
    "job_category",
    "position_name",
  ]);
  const similar = application
    ? []
    : similarTemplates(templates, name, year, job, position);
  async function submit(values: ApplicationInput) {
    const ok = await action.run(async () => {
      const user = await initializeUser();
      await saveApplication({
        ...values,
        id: application?.id ?? crypto.randomUUID(),
        user_id: user,
        company_id: application?.company_id ?? null,
        recruitment_template_id: application?.recruitment_template_id ?? null,
        research: application?.research ?? "",
        created_at: application?.created_at ?? new Date().toISOString(),
        application_start: values.application_start || null,
        application_deadline: values.application_deadline || null,
        tags: values.tags
          .split(/[,、]/)
          .map((x) => x.trim())
          .filter(Boolean),
      });
    });
    if (ok) onClose();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={application ? "企業・募集を編集" : "企業を追加"}
      description="企業と募集の情報を登録して、選考の予定をまとめましょう。"
    >
      <form onSubmit={handleSubmit(submit)} className="form-grid">
        <label className="span-2">
          企業名 <span className="required">*</span>
          <input {...register("company_name")} placeholder="例：楽天グループ" />
          {errors.company_name && (
            <small className="field-error">{errors.company_name.message}</small>
          )}
        </label>
        {similar.length > 0 && (
          <div className="similar-box span-2">
            <strong>似た募集があります</strong>
            <p>公開募集を引用すると、選考フローもコピーできます。</p>
            {similar.map((t) => (
              <div key={t.id}>
                <span>
                  {t.company_name}
                  <small>
                    {t.graduation_year}卒 · {t.job_category} ·{" "}
                    {t.selection_type}
                  </small>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      const id = await copyTemplate(t);
                      onClose();
                      router.push(`/companies/${id}?edit=1`);
                    }, "引用しました")
                  }
                >
                  引用して編集
                </Button>
              </div>
            ))}
          </div>
        )}
        <label>
          卒年度
          <input
            type="number"
            {...register("graduation_year", { valueAsNumber: true })}
          />
        </label>
        <label>
          業界
          <input {...register("industry")} placeholder="IT・SaaS" />
        </label>
        <label>
          職種
          <input {...register("job_category")} placeholder="ビジネス職" />
        </label>
        <label>
          募集名
          <input
            {...register("position_name")}
            placeholder="2028卒 ビジネス職"
          />
        </label>
        <label>
          コース名
          <input {...register("course_name")} />
        </label>
        <label>
          選考区分
          <select {...register("selection_type")}>
            {selectionTypes.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          応募開始日
          <input type="date" {...register("application_start")} />
        </label>
        <label>
          応募締切日
          <input type="date" {...register("application_deadline")} />
          {errors.application_deadline && (
            <small className="field-error">
              {errors.application_deadline.message}
            </small>
          )}
        </label>
        <label>
          志望度
          <select {...register("priority")}>
            {priorities.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          ステータス
          <select {...register("status")}>
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          募集URL
          <input {...register("url")} placeholder="https://…" />
          {errors.url && (
            <small className="field-error">{errors.url.message}</small>
          )}
        </label>
        <label>
          勤務地
          <input {...register("location")} />
        </label>
        <label>
          タグ
          <input {...register("tags")} placeholder="IT, PdM, AI" />
        </label>
        <label className="span-2">
          自分用メモ
          <textarea rows={3} {...register("memo")} />
        </label>
        {Object.keys(errors).some(
          (k) => !["company_name", "url", "application_deadline"].includes(k),
        ) && (
          <p role="alert" className="field-error span-2">
            入力内容を確認してください。卒年度は2020〜2100、日付は有効な日付を入力してください。
          </p>
        )}
        <div className="form-footer span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={action.busy} type="submit">
            {action.busy
              ? "保存中…"
              : application
                ? "変更を保存"
                : "企業を登録"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
