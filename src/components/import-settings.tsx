"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { privateRequest, loadProfile, saveProfile } from "@/lib/import/client";
import { type UserProfile } from "@/lib/import/planner";
import { isDemo } from "@/lib/supabase";
export function ImportSettings() {
  const query = useQueryClient(),
    connections = useQuery({
      queryKey: ["extension-connections"],
      queryFn: () => privateRequest("/api/import/manage"),
      enabled: !isDemo,
      retry: 0,
    }),
    gmail = useQuery({
      queryKey: ["gmail"],
      queryFn: () => privateRequest("/api/gmail"),
      enabled: !isDemo,
      retry: 0,
    }),
    profile = useQuery({ queryKey: ["profile"], queryFn: loadProfile });
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      query.invalidateQueries({ queryKey: ["extension-connections"] });
      query.invalidateQueries({ queryKey: ["gmail"] });
      query.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作できませんでした");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel p-5 mb-6" id="connections">
        <h2 className="font-semibold">Chrome拡張・Gmail連携</h2>
        <p className="muted text-sm my-3">
          現在の匿名ユーザーへ接続します。内部IDや引き継ぎコードを拡張へ入力する必要はありません。
        </p>
        {isDemo ? (
          <p>
            デモでは接続を発行しません。テキスト取り込み・Inbox・プランナーを試せます。
          </p>
        ) : (
          <>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const data = await privateRequest("/api/import/manage", {
                    action: "pair",
                  });
                  setCode(data.code);
                })
              }
            >
              拡張ペアリングコードを発行
            </Button>
            {code && (
              <div className="mt-3">
                <code className="break-all select-all">{code}</code>
                <p className="muted text-xs">
                  10分有効・1回限り。拡張の接続欄へ貼り付けてください。
                </p>
              </div>
            )}
            {connections.data?.tokens.map(
              (t: { id: string; label: string; expires_at: string }) => (
                <div key={t.id} className="flex gap-3 items-center my-3">
                  <span>
                    {t.label} · 有効期限 {t.expires_at.slice(0, 10)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(async () => {
                        await privateRequest("/api/import/manage", {
                          action: "revoke",
                          id: t.id,
                        });
                      })
                    }
                  >
                    接続を失効
                  </Button>
                </div>
              ),
            )}
            {connections.error && (
              <p className="muted">
                接続設定を取得できません。サーバーキーとmigration
                006を確認してください。
              </p>
            )}
            <hr className="my-5" />
            <h3>Gmail（任意・読み取りのみ）</h3>
            <p className="muted text-xs my-2">
              採用関連の過去7日のメールを対象にし、本文全体を保存しません。送信・削除・既読変更の権限は使用しません。
            </p>
            {!gmail.data?.configured ? (
              <p className="muted">
                Google OAuthは未設定です。他の機能はこのまま使えます。
              </p>
            ) : gmail.data.connection ? (
              <>
                <label className="block my-3">
                  <input
                    type="checkbox"
                    checked={gmail.data.connection.sync_enabled}
                    onChange={(e) =>
                      run(async () => {
                        await privateRequest("/api/gmail", {
                          action: e.target.checked ? "enable" : "disable",
                        });
                      })
                    }
                  />{" "}
                  採用メールを自動解析
                </label>
                <p className="muted text-xs">
                  最終同期：{gmail.data.connection.last_synced_at ?? "未実行"}
                </p>
                {gmail.data.connection.last_error && (
                  <p role="alert">{gmail.data.connection.last_error}</p>
                )}
                <div className="flex gap-3 mt-3">
                  <Button
                    disabled={busy || !gmail.data.connection.sync_enabled}
                    onClick={() =>
                      run(async () => {
                        const r = await privateRequest("/api/gmail", {
                          action: "sync",
                        });
                        setMessage(
                          r.busy
                            ? "同期中です"
                            : `${r.imported}件をInboxへ追加しました`,
                        );
                      })
                    }
                  >
                    今すぐ同期
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await privateRequest("/api/gmail", {
                          action: "disconnect",
                        });
                      })
                    }
                  >
                    Gmail連携を解除
                  </Button>
                </div>
              </>
            ) : (
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await privateRequest("/api/gmail", {
                      action: "connect",
                    });
                    window.location.assign(r.url);
                  })
                }
              >
                GoogleでGmailを接続
              </Button>
            )}
          </>
        )}
        {message && (
          <p role="status" className="mt-3">
            {message}
          </p>
        )}
      </section>
      <section className="panel p-5 mb-6" id="profile">
        <h2 className="font-semibold">自分の経験・関心タグ</h2>
        <p className="muted text-sm my-2">
          企業詳細の「自分との関連を見る」に使用します。公開やAIへの送信はしません。
        </p>
        {profile.data && (
          <form
            key={JSON.stringify(profile.data)}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                value = {} as UserProfile;
              for (const key of ["skills", "experiences", "interests"] as const)
                value[key] = String(form.get(key) ?? "")
                  .split(/[,、\n]/)
                  .map((s) => s.trim().slice(0, 60))
                  .filter(Boolean)
                  .slice(0, 50);
              run(async () => {
                await saveProfile(value);
                setMessage("経験タグを保存しました");
              });
            }}
          >
            <div className="form-grid">
              {[
                ["skills", "スキル"],
                ["experiences", "経験"],
                ["interests", "関心"],
              ].map(([key, label]) => (
                <label className="span-2" key={key}>
                  {label}（カンマ区切り）
                  <input
                    name={key}
                    defaultValue={profile.data![key as keyof UserProfile].join(
                      ", ",
                    )}
                    placeholder="AI, Product, English"
                  />
                </label>
              ))}
            </div>
            <Button className="mt-3" disabled={busy} type="submit">
              経験タグを保存
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
