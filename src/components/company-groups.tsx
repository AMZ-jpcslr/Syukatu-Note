"use client";
import Link from "next/link";
import type { Application, Store } from "@/lib/types";
import { groupApplications } from "@/lib/applications";
import { progress } from "@/lib/dates";
import { Button } from "./ui/button";
import {
  ApplicationDeadline,
  CompanyMark,
  Progress,
  StatusBadge,
} from "./shared";
export function CompanyGroups({
  items,
  store,
  onAdd,
}: {
  items: Application[];
  store: Store;
  onAdd: (a: Application) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      {groupApplications(items, store.applications).map((group) => (
        <section
          className="panel company-group"
          key={group.key}
          aria-label={group.name + "の募集"}
        >
          <div className="panel-heading flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CompanyMark name={group.name} />
              <h2>
                {group.name}{" "}
                <span className="count-pill">
                  {group.applications.length}募集
                </span>
              </h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAdd(group.applications[0])}
            >
              別の職種・募集を追加
            </Button>
          </div>
          <div className="divide-y divide-border">
            {group.applications.map((a) => (
              <Link
                key={a.id}
                href={"/companies/" + a.id}
                className="block p-4 hover:bg-muted/40"
              >
                <span className="sr-only">{a.company_name} </span>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <h3 className="font-medium">
                      {a.position_name || a.job_category || "募集名未設定"}
                    </h3>
                    <p className="text-xs muted mt-1">
                      {a.graduation_year}卒 · {a.job_category || "職種未設定"} ·{" "}
                      {a.selection_type}
                    </p>
                  </div>
                  <ApplicationDeadline application={a} />
                </div>
                <div className="flex gap-3 items-center flex-wrap mt-3">
                  <StatusBadge status={a.status} />
                  <span className="priority-badge">{a.priority}</span>
                  <Progress {...progress(store, a.id)} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
