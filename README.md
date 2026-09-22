# しゅうかつ手帳

登録・ログイン画面なしで使える、就職活動の企業・募集・選考・タスク管理アプリです。日本語UI、レスポンシブ、ライト／ダークモードに対応しています。

## 実装範囲

| Phase | 内容                                                                             |
| ----- | -------------------------------------------------------------------------------- |
| 1     | Supabase匿名認証、企業・募集CRUD、選考フロー・タスク、ダッシュボード、カレンダー |
| 2     | 公開募集、企業名の類似検索、引用／引用して編集、公開・非公開の切り替え           |
| 3     | ES、面接記録、企業研究、アプリ内通知、フィルター、業界・志望度・選考状況の集計   |
| 4     | 使い捨て引き継ぎコード、企業・選考・タスクCSV、PWA manifest／オフライン案内      |

カレンダーは月／週／リストを切り替え可能。応募・選考・タスク・面接記録の日付から都度生成し、イベントを選ぶと企業詳細へ移動します。日時・通知ルールは日本時間（Asia/Tokyo）です。

## 技術構成

- Next.js **16.3.5**（作成時のlatest stable）、App Router、React 19、TypeScript
- Tailwind CSS 4、shadcn/ui形式のButton／Radix Dialog、Lucide
- Supabase PostgreSQL / Auth / PostgREST、RLS
- Drizzle ORM（型付きDBスキーマとseed）、SQL migration
- React Hook Form、Zod、TanStack Query、date-fns
- FullCalendar 6.1.21 + Luxon timezone plugin
- Vitest、PGlite（実PostgreSQLのWASMビルド）、Playwright

FullCalendarはcore/reactと各プラグインの互換性を揃えるため6.1.21に固定しています。アプリ実行時のDBアクセスはSupabase SDKからPostgRESTを経由します。Drizzleの管理者接続をリクエスト処理に使わず、各ユーザーのJWTに対してRLSを適用します。

## ローカル起動

Node.js 22以上、pnpm 11.19.0を使います。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

PowerShellではコピーに `Copy-Item .env.example .env.local` を使えます。[http://localhost:3000](http://localhost:3000)を開いてください。

### 接続なしで動作確認

`.env.local` に以下を設定します。

```dotenv
NEXT_PUBLIC_DEMO_MODE=true
```

7社のデモ企業・選考・タスクをブラウザ内に作成します。日程は表示確認用の架空情報で、実在企業の現在の募集を表しません。変更はlocalStorageに保存されます。画面に「DEMO」「架空の日程」と明示します。

デモのデータは別ブラウザには共有されません。公開／引用は同じブラウザ内での機能確認です。引き継ぎはSupabase接続時のみ有効です。本番とデモは別ストレージで、未設定の本番接続からデモへ勝手にフォールバックしません。

## Supabase設定

1. Supabaseでプロジェクトを作成します。
2. **Authentication → Sign In / Providers → Anonymous Sign-Ins** を有効にします。メールやパスワードの登録画面は使用しません。
3. プロジェクトのURLとpublishable keyを取得します。古いプロジェクトのanon keyも同じ変数に設定可能です。
4. SQL Editorで、下記migrationを順に**全文**実行します。
5. SupabaseのSite URLにローカルまたはVercelのURLを設定します。
6. `.env.local` を設定し、開発サーバーを再起動します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_DEMO_MODE=false
```

RLSは公開テンプレート以外の個人データを所有者に制限します。公開テンプレートの閲覧も、画面裏側で自動作成された匿名セッションを使います。未認証のanonロールには個人テーブルの権限を付与していません。

匿名サインインのレート制限はSupabase側で設定してください。CAPTCHAをSupabaseで有効にする場合は、このアプリにCAPTCHA tokenの取得・送信を追加する必要があります（現在のUIでは未実装）。匿名ユーザーを一律自動削除するジョブは設定しないでください。データや引き継ぎ元のIDが失われます。

## 環境変数

| 変数                                 | 用途                                           | 必須            |
| ------------------------------------ | ---------------------------------------------- | --------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Supabase Project URL                           | 本番            |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 公開APIキー                                    | 本番            |
| NEXT_PUBLIC_DEMO_MODE                | trueで明示的なローカルデモ                     | 任意、通常false |
| DATABASE_URL                         | migration／Drizzle seed専用のPostgreSQL接続URL | CLI操作時のみ   |
| PLAYWRIGHT_CHANNEL                   | E2Eブラウザ。既定msedge、CIはchromium          | テスト時のみ    |

`DATABASE_URL`は秘密情報です。`NEXT_PUBLIC_`を付けません。service_role keyは不要です。`NEXT_PUBLIC_`値はNext.jsのビルド時に組み込まれるため、変更後は再ビルド／再デプロイします。

## DB migration / seed

適用順：

1. `supabase/migrations/202609220001_initial.sql`：テーブル・インデックス・RLS・共有／引用／引き継ぎRPC
2. `supabase/migrations/202609220002_csv.sql`：トランザクション内のCSV一括追加・選考種別制約

SQL Editorを使う場合は上記を順に実行します。Supabase CLIを使う場合：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

ローカルSupabaseはDocker + Supabase CLIの `supabase start` / `supabase db reset` で起動・初期化できます。

公開サンプル7社はDrizzle経由で投入できます。プロジェクトのConnectから取得した**直接接続またはsession pooler** URLを、環境変数 `DATABASE_URL` または `.env` に設定します（スクリプトのdotenvは `.env.local` を自動読込しません）。

```bash
pnpm db:seed
```

seedは固定UUIDにより再実行可能です。応募日・締切・URLは未設定にして、誤った募集日程が本番に入らないようにしています。企業名と募集区分はサンプルで、採用実施を保証する情報ではありません。

`src/db/schema.ts` はDrizzle定義、`supabase/migrations` が権限や関数を含む実際のDDLの正本です。将来 `pnpm db:generate` で差分を生成した場合も、既存テーブルを重複作成せず、RLS・GRANT・関数をレビューした新しいSupabase migrationとして追加してください。`drizzle-kit push`を本番に実行しないでください。

## Vercelへのデプロイ

1. このディレクトリをGitHubリポジトリとしてpushします。
2. Vercelの「Add New → Project」からリポジトリをImportします。
3. Framework Presetは **Next.js**。Root Directoryをこのアプリのあるディレクトリにします。
4. Node.jsは **22.x以上**。Install Commandは `pnpm install --frozen-lockfile`、Build Commandは `pnpm build`、Output DirectoryはNext.js既定のままです。
5. Production環境にSupabase URL・publishable keyを登録し、`NEXT_PUBLIC_DEMO_MODE=false`を設定します。
6. Supabase migrationを適用してからDeployします。Vercelへの `DATABASE_URL` 登録は不要です。
7. SupabaseのSite URLに本番URLを設定します。
8. 通常ブラウザとシークレットウィンドウで別々に開き、以下のスモークテストを行います。

- 登録／ログインの入力なしで企業を登録し、再読込後も残る
- 他方のブラウザに私的企業・メモ・ESが見えない
- 公開した募集を他方で検索・引用できる
- 引用元の非公開化後も、自分のコピーとメモが残る
- 引き継ぎで記録が移り、元ブラウザを再読込すると移行済み記録が見えない
- スマホで企業登録・タスク完了・カレンダー操作ができる

Preview環境は検証用Supabaseプロジェクトを分けるか、デモモードにすることを推奨します。第三者が管理するPreviewで本番データを扱わない構成にできます。

このリポジトリの作成時点では、Supabase/Vercelの認証情報が提供されていないため、クラウドプロジェクト作成・実migration・実デプロイは行っていません。

## アーキテクチャ・スキーマ

```text
ブラウザ（登録画面なし）
 ├─ Supabase Auth.signInAnonymously()
 │    └─ auth.users UUID + JWT / refresh token → localStorage
 ├─ TanStack Query → Supabase SDK → PostgREST → RLS → PostgreSQL
 ├─ FullCalendar ← 応募日・選考日・タスク期限・面接日時から派生
 └─ デモ時のみ → 別のlocalStorageデータ

共有：companies → recruitment_templates
                           ↓ コピー（snapshot + 公開フロー）
個人：anonymous_users → user_applications
                            ├─ selection_steps
                            ├─ tasks
                            ├─ es_questions
                            └─ interview_notes
```

| テーブル              | 主な内容                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| anonymous_users       | auth.usersに対応する匿名ID、コードハッシュ・有効期限、登録日                                        |
| companies             | 公開企業マスター。企業名、業界、website                                                             |
| recruitment_templates | 募集スナップショット、卒年度、職種、募集名、選考区分、開始・締切、URL、公開フロー、公開状態、投稿者 |
| user_applications     | 所有者、企業・募集の独立スナップショット、志望度、状態、メモ、タグ、企業研究                        |
| selection_steps       | 種別、期限・実施日時、完了、結果、メモ、URL、順序                                                   |
| tasks                 | 種類、期限、完了、メモ、URL                                                                         |
| es_questions          | 設問、文字数、回答、下書き／完成／提出済み                                                          |
| interview_notes       | 日時、段階、形式、面接官、質問・回答・振り返り・結果                                                |
| transfer_attempts     | 引き継ぎの試行回数。クライアントから直接読書不可                                                    |

未公開の手入力企業はuser_applicationsのスナップショットにのみ保存し、公開時に企業マスターと募集テンプレートを作ります。これにより、企業名や応募先の存在自体を勝手に共有しません。

calendar_eventsは永続化せず派生イベントとして型定義しています。元の期限を編集・削除したときに、古いカレンダー行が残る不整合を回避します。個人データはクライアント取得のため、Next.jsの静的ページに埋め込みません。

## 個人データの保護

- ブラウザが申告した `anonymous_user_id` だけで認可しません。Supabaseが署名したJWTの `auth.uid()` で判定します。localStorageのIDを書き換えても他人のデータは読めません。
- 子テーブルは `(user_application_id, user_id)` の複合外部キーで、所有者の異なる企業への紐づけを拒否します。
- 公開RPCは共有可能な列だけを挿入し、ES回答、面接記録、メモ、結果、タスク、志望度、タグ、勤務地は読み取りません。
- 公開フローは個人ステップから自動転記せず、公開ダイアログで一般的な種類を明示選択します。
- 公開テンプレートは作者だけが公開状態を変更可能。編集・再投稿は個人側を編集して新規公開します。既存コピーは更新しません。
- 引き継ぎコードは暗号学的乱数32バイト（64桁hex）、DBにはSHA-256のみ保存。30日・1回限り、同一匿名ユーザーは毎時5回まで試行可能。トランザクションと行ロックで同時利用を防ぎます。
- コードの平文は発行したブラウザでのみ再表示可能。紛失した場合は元ブラウザから再発行できます。復旧先では古いコードを使い回せません。
- エクスポート時はCSVの数式注入をエスケープ。インポートはZod検証・件数確認後、1トランザクションで追加します。
- Service Workerは個人データ・認証API・アプリHTMLをキャッシュしません。オフライン時は再接続案内を表示します。
- 匿名方式のため、セッションと引き継ぎコードを両方失うと、本人確認による復旧はできません。

## 機能上の制限

- ブラウザ通知はユーザー操作時に現在の通知を表示します。バックグラウンドpushや定期送信は未実装。アプリ内通知は7・3・1・0日前を表示します。
- CSV対象は企業／募集／選考／タスク。ES、面接記録、企業研究はCSVに含みません。完全な移行には引き継ぎコードを使います。
- 引き継ぎは所有権の移動です。複数端末からの同時編集・端末共有ではありません。
- 手入力の募集日と選考日時を扱います。募集サイトの自動取得・更新は行いません。
- 同一の面接を選考ステップと面接記録の両方に日時付きで登録した場合、両方がカレンダーに表示されます。片方の日時だけを予定として使うか、記録側に結果を入力して完了表示にしてください。
- PWAはインストール可能なmanifestとオフライン案内を提供します。オフラインでのデータ編集や同期キューは未実装です。
- インターンなどの日跨ぎ開催は、必要な開催日をステップとして登録できます。複数日を範囲として編集するUIは未実装です。
- 公開募集検索はRLSで可視な募集をページング取得し、企業名の正規化（全半角・株式会社等）と卒年度・職種・募集名の一致で候補を出します。大規模公開データでは全文検索・サーバー検索に拡張してください。

## ディレクトリ

```text
src/
  app/                     App Routerの各ページ・共通レイアウト・テーマ
  components/              画面ごとのUI、フォーム、providers
    ui/                    shadcn/ui形式の共通Button・Dialog
  db/schema.ts             Drizzle schema
  lib/
    types.ts               ドメイン型
    validation.ts          企業入力Zodスキーマ
    supabase.ts             匿名セッション
    repository.ts           RLS経由CRUD・RPC、デモadapter
    dates.ts                JST・イベント生成・進捗・通知
    templates.ts            類似検索・公開allowlist
    csv.ts                  CSV検証・入出力
    demo.ts                 架空サンプル
supabase/migrations/        SQL / RLS / RPC
scripts/seed.ts             Drizzleで公開サンプル投入
tests/                      ドメイン・PostgreSQL RLSテスト
  e2e/                      デスクトップ／スマホの操作テスト
public/                     PWA manifest・アイコン・Service Worker
```

## 検証

実装時の確認結果：TypeScriptチェック、本番ビルド、18件のドメイン／RLSテスト、デスクトップ・スマホ合計4件のE2Eテストが成功しています。

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

単体／DBテストはSupabase接続不要です。PGlite上にSupabaseの `auth.uid()` 相当のテスト用関数を置き、本物のmigration SQLを適用してRLS・複合FK・RPC・トランザクションを検証します。Supabase Authサービス自体やクラウド設定の代替テストではありません。

E2Eはローカルデモを立ち上げ、Edgeでデスクトップ／iPhone幅をテストします。Edgeがない環境では以下を使えます。

```bash
pnpm exec playwright install chromium
PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e
```

PowerShell：`$env:PLAYWRIGHT_CHANNEL='chromium'; pnpm test:e2e`。

コード整形：

```bash
pnpm format
```

## 公式資料

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle and Supabase](https://orm.drizzle.team/docs/connect-supabase)
