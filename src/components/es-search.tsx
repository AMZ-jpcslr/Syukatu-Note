"use client";
import { useState } from "react";
import Link from "next/link";
import type { Store } from "@/lib/types";
import { characterCount } from "@/lib/workflow";
export function ESSearch({ store }: { store: Store }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().normalize("NFKC").toLowerCase();
  const results = normalized
    ? store.es.filter((q) =>
        `${q.question} ${q.answer}`
          .normalize("NFKC")
          .toLowerCase()
          .includes(normalized),
      )
    : [];
  return (
    <div className="es-search p-5 border-b border-border">
      <label>
        過去ESを検索（自分の企業すべて）
        <input
          type="search"
          placeholder="例：学生時代"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {normalized && (
        <>
          <p className="muted text-xs mt-3">{results.length}件</p>
          {results.map((q) => (
            <article className="note-card" key={q.id}>
              <Link
                className="text-link"
                href={`/companies/${q.user_application_id}?tab=ES`}
              >
                {
                  store.applications.find((a) => a.id === q.user_application_id)
                    ?.company_name
                }
              </Link>
              <h3>{q.question}</h3>
              <p className="whitespace-pre-wrap">{q.answer}</p>
              <small className="muted">
                {characterCount(q.answer)} / {q.max_length}文字 · {q.status}
              </small>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
