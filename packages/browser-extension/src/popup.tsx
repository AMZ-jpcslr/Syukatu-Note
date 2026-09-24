import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { collectVisiblePage } from "./collect-visible";
import { extractPage } from "./providers";
import { sanitizeExtraction } from "../../../src/lib/import/parser";
import type { PageExtractionResult } from "../../../src/lib/import/schema";
import "./popup.css";
declare const __APP_URL__: string;
const appUrl = __APP_URL__;
function Popup() {
  const [consent, setConsent] = useState(false),
    [code, setCode] = useState(""),
    [paired, setPaired] = useState(false),
    [result, setResult] = useState<PageExtractionResult | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    chrome.storage.local.get(["privacyAccepted", "token"]).then((s) => {
      setConsent(!!s.privacyAccepted);
      setPaired(!!s.token);
    });
    chrome.storage.session.get("draft").then((s) => {
      if (s.draft) {
        try {
          setResult(sanitizeExtraction(s.draft));
        } catch {
          chrome.storage.session.remove("draft");
        }
      }
    });
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  async function api(path: string, body: unknown, token?: string) {
    const res = await fetch(appUrl + path, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "接続できませんでした");
    return data;
  }
  return (
    <main>
      <header>
        <strong>しゅうかつ手帳</strong>
        <small>CAREER WORKSPACE v2</small>
      </header>
      {!consent ? (
        <section>
          <h1>見ているページを、自分の手帳へ。</h1>
          <p>この拡張機能は、あなたがボタンを押したページのみ解析します。</p>
          <p>
            パスワードやCookieは取得しません。フォーム入力・ES回答欄は読み取り対象から除外します。
          </p>
          <p>
            送信前に候補と証拠を確認できます。ES本文は送信せず、サーバーには抽出項目だけを保存します。
          </p>
          <button
            onClick={() =>
              run(async () => {
                await chrome.storage.local.set({ privacyAccepted: true });
                setConsent(true);
              })
            }
          >
            確認して利用する
          </button>
        </section>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const [tab] = await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                });
                if (!tab?.id)
                  throw new Error("企業MyPageのタブを開いてください");
                const response = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: collectVisiblePage,
                  args: [false],
                });
                const input = response[0]?.result;
                if (!input) throw new Error("このページでは利用できません");
                const parsed = sanitizeExtraction(extractPage(input));
                setResult(parsed);
                await chrome.storage.session.set({ draft: parsed });
                await chrome.action.setBadgeText({
                  text: String(parsed.deadlines.length + parsed.events.length),
                  tabId: tab.id,
                });
              })
            }
          >
            このページから就活情報を取り込む
          </button>
          {result && (
            <section>
              <h2>{result.companyName ?? "企業名はアプリで確認"}</h2>
              <p>{result.recruitmentName ?? result.pageTitle}</p>
              <small>
                {result.parserProvider} · {Math.round(result.confidence * 100)}%
                · {result.pageUrl}
              </small>
              <p>
                検出：
                {result.deadlines.length +
                  result.events.length +
                  result.detectedSelectionSteps.length}
                件
              </p>
              {[
                ...result.deadlines,
                ...result.events,
                ...result.detectedSelectionSteps,
              ].map((item) => (
                <article key={item.key}>
                  <strong>{item.title}</strong>
                  <p>{item.date ?? `${item.dateLabel}（年は未確認）`}</p>
                  <details>
                    <summary>送信する証拠テキスト</summary>
                    <p>{item.evidence}</p>
                  </details>
                </article>
              ))}
              {result.warnings.map((w) => (
                <p key={w} className="muted">
                  {w}
                </p>
              ))}
              <button
                disabled={
                  busy ||
                  !paired ||
                  (!result.deadlines.length &&
                    !result.events.length &&
                    !result.detectedSelectionSteps.length)
                }
                onClick={() =>
                  run(async () => {
                    const { token } = await chrome.storage.local.get("token");
                    if (typeof token !== "string")
                      throw new Error("再ペアリングしてください");
                    await api("/api/import/browser-page", result, token);
                    setMessage(
                      "自動取得Inboxへ送りました。アプリで承認してください。",
                    );
                    await chrome.storage.session.remove("draft");
                  })
                }
              >
                しゅうかつ手帳に送る
              </button>
            </section>
          )}
          <section>
            <h2>アプリと接続</h2>
            <p>
              {paired
                ? "接続済み"
                : "設定画面で発行した10分有効のコードを入力してください。"}
            </p>
            <label>
              ペアリングコード
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                placeholder="SHUKATSU-…"
                autoComplete="off"
              />
            </label>
            <button
              disabled={busy || !code}
              onClick={() =>
                run(async () => {
                  const data = await api("/api/import/pair", { code });
                  await chrome.storage.local.set({ token: data.token });
                  setPaired(true);
                  setCode("");
                  setMessage("接続しました");
                })
              }
            >
              ペアリング
            </button>
            {paired && (
              <button
                className="secondary"
                onClick={() =>
                  run(async () => {
                    await chrome.storage.local.remove("token");
                    setPaired(false);
                    setMessage(
                      "この拡張の接続を解除しました。アプリの設定でもトークンを失効できます。",
                    );
                  })
                }
              >
                この拡張の接続を解除
              </button>
            )}
          </section>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <a href={appUrl + "/inbox"} target="_blank" rel="noreferrer">
        自動取得Inboxを開く ↗
      </a>
      <footer>
        送信しても予定は変わりません。反映にはアプリ側の承認が必要です。
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
