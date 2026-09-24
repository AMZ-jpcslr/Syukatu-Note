# アーキテクチャ・データ保護

[READMEへ戻る](../README.md) · [セットアップ](setup.md) · [自動取得](recruitment-monitoring.md)

## 全体構成

```text
ブラウザ（ログイン画面なし）
 ├─ Supabase Auth.signInAnonymously()
 │    └─ 匿名ユーザーUUID + JWT / refresh token → localStorage
 ├─ TanStack Query → Supabase SDK → PostgREST → RLS → PostgreSQL
 ├─ FullCalendar ← 応募日・選考日・タスク期限・面接日時から派生
 ├─ 匿名JWT付きAPI → 公開URL取得・候補レビュー・キュー
 └─ デモ時のみ → 別のlocalStorage

Vercel Cron → 認証されたジョブ処理 → 公開URL取得 → 更新候補
                                                    ↓ 手動承認
                                            公開募集／自分の応募
```

通常の個人データ操作はSupabase SDKとユーザーJWTを使い、RLSで制御します。Drizzleの管理者接続を通常の個人データ操作に使いません。監視バックグラウンド処理ではサーバー専用キーを使い、ユーザー向けAPIは匿名JWTを検証します。

DBの実DDL・RLS・RPCは [supabase/migrations](../supabase/migrations)、型付きスキーマは [src/db/schema.ts](../src/db/schema.ts) にあります。

## 共有と個人コピー

```text
共有：companies → recruitment_templates
                           ↓ 独立したスナップショットをコピー
個人：anonymous_users → user_applications
                            ├─ selection_steps
                            ├─ tasks
                            ├─ es_questions
                            └─ interview_notes
```

| テーブル                                                      | 内容                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `anonymous_users`                                             | Authユーザーに対応するID、引き継ぎコードのハッシュ・有効期限           |
| `companies`                                                   | 企業名・業界・公式URL・タグ・別名・seed key                            |
| `recruitment_templates`                                       | 卒年度・職種・募集名・区分・日程・公開フロー・情報元・信頼性           |
| `user_applications`                                           | 募集の独立コピー、志望度、個人の状況、メモ、企業研究、コピー時点の締切 |
| `selection_steps` / `tasks`                                   | 日程、進行状態、結果、メモ、順序、連携元ステップ                       |
| `es_questions` / `interview_notes`                            | ES設問・回答・提出状態、面接日時・質問回答・振り返り                   |
| `user_preferences` / `watchlist`                              | タスク・カレンダー自動連携設定、気になる募集                           |
| `template_reports`                                            | 情報訂正報告。報告者本人とDB管理者のみ参照                             |
| `company_sources` / `company_source_snapshots`                | 公開ページのURL・監視状態・本文ハッシュ・取得履歴                      |
| `recruitment_monitor_jobs` / `recruitment_update_candidates`  | 非同期取得ジョブ、証拠付き更新候補                                     |
| `recruitment_candidate_reviews` / `recruitment_reviewers`     | 確認履歴、公開テンプレートのレビュー担当                               |
| `recruitment_monitor_preferences` / `company_source_settings` | 個人の監視設定                                                         |
| `recruitment_ai_budget` / `transfer_attempts`                 | AI回数上限、引き継ぎ試行制限。クライアントの任意操作対象外             |

手入力の非公開募集は `user_applications` に保存し、公開時に企業マスター・テンプレートを作ります。応募先の存在を勝手に公開しません。

テンプレート変更は個人コピーへ自動反映しません。`copied_application_deadline` とコピー時の締切種別を保持して更新を通知し、ユーザーが「更新を反映」を選んだ場合だけ更新します。公開募集のDB上の変更は最大60秒ごと・画面復帰時に取得します。外部サイトの巡回とは別の処理です。

非公開化したテンプレートの新しい情報は通知できませんが、個人コピーは残ります。一般投稿は `user_submitted / unverified` で、公式URLがないものは他ユーザーに提供しません。投稿RPCは許可した公開項目だけを取り込み、余剰の私的データやverified指定は破棄します。

## 日程・タスク・募集状況

カレンダーイベントは永続化せず、元の日程から派生させます。日付の変更・削除後に古いイベント行が残る問題を避けます。

- ステップ由来のタスクは `selection_step_id` で重複を防ぎ、完了を双方向同期します。タスクのメモは保持します。
- 自動生成タスクを予定や進捗へ二重計上しません。
- タスク自動作成OFFは新規生成を止めます。既存の連携タスクの期限・完了同期は継続します。
- 既存ステップを設定変更だけで一括タスク化せず、日程などを保存したときに生成します。
- 「定員に達し次第終了」は日付を空欄で保存できます。最終締切があれば日付との併記も可能です。
- 「募集終了」は個人の「選考中」「内定」などと別の状態です。応募締切のリマインドから外しても、面接やタスクを消しません。
- 同一企業はマスターIDを優先し、手入力は企業名の全半角・英字大小・空白を正規化してまとめます。似ているだけの企業名・子会社は統合しません。

## 匿名利用とデータ保護

ブラウザ申告のUUIDだけでは認可しません。Supabaseの署名付きJWTから `auth.uid()` を取得し、RLSで本人のデータだけを許可します。子テーブルの複合外部キーでも所有者が違う応募への紐づけを拒否します。

ES、面接、個人メモ、志望度、結果、個人タスクは公開しません。公開フローは個人メモから自動転記せず、共有ダイアログで公開可能な種類を選びます。これらの個人データは募集解析のクエリ・Geminiへの入力にも含めません。

個人データを静的ページへ埋め込まず、Service Workerも個人データ・認証API・アプリHTMLをキャッシュしません。

### 引き継ぎ

- 暗号学的乱数32バイト（64桁hex）を発行し、DBにはSHA-256ハッシュだけ保存
- 有効期限30日、1回限り。同一匿名ユーザーの試行は毎時5回まで
- トランザクション・行ロックで同時利用を防止
- 平文の再表示は発行したブラウザのみ。紛失時は元ブラウザで再発行
- 所有権を新しい匿名ユーザーへ移動。複数端末の同時共有ではない
- セッションと引き継ぎコードの両方を失った場合、本人確認による復旧はできない

### CSV・PWA・その他の制約

CSVは `applications.csv` / `selection_steps.csv` / `tasks.csv` と旧形式を扱います。Zodで検証して件数を確認し、トランザクションで新規追加します。既存の応募を上書きせず、選考と自動タスクの関連を復元します。数式注入を避けるためエクスポート時に値をエスケープします。

CSVにES・面接記録・企業研究は含みません。これらを含む移行は引き継ぎコードを使います。

PWAはmanifest・アイコン・オフライン案内を提供します。オフライン編集・同期キューは未実装です。アプリ内通知は7・3・1・0日前を対象とし、ブラウザ通知はユーザー操作時の表示に限ります。バックグラウンドPush配信はありません。

公開検索はRLSで可視な募集を取得し、企業名の正規化・卒年度・職種・募集名で照合します。大規模データではサーバー側検索への拡張が必要です。訂正報告の受付UIはありますが、管理者向け専用審査画面やメール送信はありません。運営はSupabase Table Editorの `template_reports` で確認します。
