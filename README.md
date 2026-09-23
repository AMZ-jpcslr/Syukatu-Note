# しゅうかつ手帳 / CAREER WORKSPACE v1.1

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
3. `supabase/migrations/202609220003_v11.sql`：v1.1の追加列・RLS・選考連携・コピー／CSV RPCの更新
4. `supabase/migrations/202609230004_capacity_deadlines.sql`：定員締切・募集終了状況・コピー／CSV RPCの追加対応

SQL Editorを使う場合は上記を順に実行します。Supabase CLIを使う場合：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

ローカルSupabaseはDocker + Supabase CLIの `supabase start` / `supabase db reset` で起動・初期化できます。

50社の企業マスター・2028卒募集監視テンプレートは `supabase/seed.sql` をSQL Editorで全文実行するか、次のコマンドで投入します。Connectで取得した直接接続またはsession poolerの接続文字列を `.env.local` の `DATABASE_URL` に設定してください（既存の環境変数を優先して読み込みます）。

```bash
pnpm db:seed
# または npm run db:seed
```

`seed_key` の一意制約、企業名の一意制約、トランザクションとadvisory lockにより繰り返し実行できます。既存の2028卒公開募集に公式URLがあれば、その募集を優先して監視テンプレートを追加しません。既存情報の名称・業界・日程・募集内容を上書きしません。日本語／英語の別名は `scripts/recruitment-companies.json` に記載しています。

新規監視テンプレートは「2028卒 採用情報」「未発表」「unknown / unverified」です。職種は未設定、開始・締切・最終確認はNULL、公開選考フローは空配列です。企業分野のタグから具体的な職種募集を推定しません。提供された公式URLは採用情報の参照先であり、閲覧確認・2028卒募集の存在確認済みとは扱いません。

SQL実行末尾の `seeded_companies` と `companies_with_public_2028_templates` がどちらも **50** になることを確認します。全企業数は既存企業があれば50より多くなります。

```sql
SELECT COUNT(*) AS seeded_companies
FROM public.companies WHERE seed_key LIKE 'career-company-%';
```

旧サンプル7社のseedは `pnpm db:seed:demo` に残しています。既存データは削除しませんが、URLなしの募集はv1.1では他ユーザーの検索・引用対象外です。本番の初期投入には50社seedを使ってください。

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

v1.0は利用者が本番デプロイ済みです。v1.1のmigration・seed・再デプロイは、下記の更新手順で対象の本番プロジェクトへ適用してください。ローカルテストの成功は本番DBへの適用完了を意味しません。

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
scripts/seed-recruitment-templates.ts  50社seed・件数確認
supabase/seed.sql          SQL Editor用の50社seed（再実行可能）
tests/                      ドメイン・PostgreSQL RLSテスト
  e2e/                      デスクトップ／スマホの操作テスト
public/                     PWA manifest・アイコン・Service Worker
```

## 検証

単体・DBテストに加え、既存データのあるv1 DBからの更新と、デスクトップ・スマホの既存操作／v1.1操作を検証します。

```bash
pnpm typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

単体／DBテストはSupabase接続不要です。PGlite上にSupabaseの `auth.uid()` 相当のテスト用関数を置き、本物のmigration SQLを適用してRLS・複合FK・RPC・トランザクションを検証します。Supabase Authサービス自体やクラウド設定の代替テストではありません。

E2Eは専用ポート3100で明示的なローカルデモを立ち上げ、既存サーバーを再利用せず、Edgeでデスクトップ／iPhone幅をテストします。Edgeがない環境では以下を使えます。

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

## Vercelで環境変数が未設定と表示される場合

このメッセージはDB接続やRLSの検査結果ではなく、ブラウザ用ビルドに接続設定が入っていないことを示します。SQLの再実行では解消しません。

1. Vercelの対象アプリ → Settings → Environment Variablesで、省略表示ではなく編集画面の完全な名前を確認します。URLは `NEXT_PUBLIC_SUPABASE_URL`、キーは `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` です。
2. 旧形式の連携向けに `NEXT_PUBLIC_SUPABASE_ANON_KEY` も利用できます。両方ある場合はPublishable keyを優先します。`SUPABASE_URL` や `SUPABASE_PUBLISHABLE_KEY` のように `NEXT_PUBLIC_` がない変数は、ブラウザ用の設定としては読みません。
3. 名前だけでなく値が空でないこと、URLとキーがSQLを適用した同一プロジェクトのものかを確認します。入力前後の空白・改行はアプリで除去します。
4. Production（プレビューを使う場合はPreviewにも）に保存し、新しいビルドを作成します。切り分け時はRedeploy画面の「Use existing Build Cache」を外してください。
5. 最新デプロイのVisitから開き、対象ドメインにそのデプロイが反映されていることを確認します。

修正版では不足している変数の名前だけを画面に表示します。さらにVercelの非デモビルドは設定不足で失敗し、不足変数名をBuild Logsに表示します。キーの値はログに出力しません。既存のデプロイにこの改善を反映するには、修正版をGitHubにpushした後にビルドする必要があります。

`relation "anonymous_users" already exists` が出た場合、元のCREATE文を繰り返さず、`supabase/diagnostics/check_setup.sql` で既存オブジェクトの有無とRLSの有効化を確認できます。このSQLはデータを変更しません。すべてOKでも、Vercel環境変数や接続先プロジェクトの一致は別途確認が必要です。

## v1.1で追加・改善した機能

- 「募集を探す」：企業名・別名、業界、職種／企業分野タグ、卒年度、募集種別、募集中のみの検索。企業追加中も候補を表示。
- 「すべて引用」：表示中の公開募集をまとめて応募予定へ追加。引用済みは除外し、志望度は未設定で保存します。通常の引用後は検索・絞り込みを保ったまま募集一覧に留まり、「コピーして編集」の場合のみ編集画面へ移動します。
- 公式URL・情報元・確認状態・最終確認日・募集状況を表示。URL不明の投稿は他ユーザーに提供しません。
- 「応募予定に追加」「コピーして編集」：公開フローを含む独立コピーをトランザクションで作成。志望度は未設定で始まり、追加後に選択できます。
- 気になる企業（watchlist）、非公開の情報訂正報告、最近追加された募集をダッシュボードに表示。
- 締切更新通知：`copied_application_deadline` と公開テンプレートの現在値を比較。個人側で変更した値とは別にコピー時点を保持し、確認ダイアログから明示反映。途中で公開締切が変わった場合は再読込を要求します。
- 選考フローの7状態、ドラッグ操作、キーボード／スマホ対応の上下ボタン。表示順更新は全ステップを原子的に保存。
- 選考の日付設定でタスクを自動生成。`selection_step_id` の一意制約と所有者を含む複合FKで重複・他ユーザーへの紐づけを防止。完了状態は双方向同期。タスクのメモは保持。
- カレンダーは既存の派生方式を維持し、日付変更・削除が即反映。自動生成タスクは予定・進捗の二重集計から除外。
- 設定画面のタスク自動作成／カレンダー自動追加スイッチをDBに保存。タスク自動作成OFFは新規生成を止め、既存タスクは保持して期限・完了を同期。既存ステップの一括タスク生成は行わず、日付などを保存したときに生成します。
- ダッシュボードは今日、3日以内の締切、今週、次の選考、応募予定、選考中、内定、公開募集、気になる企業、締切更新の順。
- ESの未着手／下書き／完成／提出済み、提出日時、Unicode文字数、本人だけの過去ES検索。
- 面接の場所／URLと複数の質問・回答。既存の自由記述形式も表示・編集可能。
- 3ファイルCSV（applications / tasks / selection_steps）と従来CSVをサポート。インポートは既存企業を変更せず新規追加し、ステップと自動タスクの関連も復元。
- 既存の匿名認証・安全な引き継ぎコード・下部ナビ・PWAを継続。追加したwatchlist／報告／設定もコードで移行。

### v1.0からの本番更新手順（既存データを保持）

1. Supabaseで対象プロジェクトを確認します。運用上のバックアップを確保し、可能なら検証用DBへ先行適用します。
2. SQL Editorで **`supabase/migrations/202609220003_v11.sql`**、続いて **`supabase/migrations/202609230004_capacity_deadlines.sql`** を全文実行します。003まで適用済みなら004だけを実行します。001・002を適用済みなら再実行しません。003はトランザクション内の列／テーブル追加・制約拡張・関数置換で、既存テーブル・行を削除しません。列追加後に旧CSV RPCを更新するため、必ず全文を適用してください。
3. **`supabase/seed.sql`** を全文実行します（seedは再実行可）。結果2行の各件数が50か確認します。
4. 任意で `supabase/diagnostics/check_v11.sql` を実行します。RLS・新規列・関数・seed件数を読み取り専用で確認できます。
5. ローカルで `pnpm install --frozen-lockfile`、`npm run lint`、`npm run test`、`npm run build` を実行します。pnpmの同名scriptsでも同じ検証です。TypeScriptはESLintの対応APIに合わせて6.0.2に固定しています。
6. コード・`pnpm-lock.yaml`・`pnpm-workspace.yaml` をGitHubへpushし、既存Vercelプロジェクトを再デプロイします。環境変数の追加はありません。URLと公開キー、`NEXT_PUBLIC_DEMO_MODE=false` を維持します。
7. 本番で企業追加、再アクセス、募集検索→保存→追加、選考の日付→タスク／カレンダー連携、ES／面接の保存を確認します。別ブラウザで個人データが見えないことも確認します。

`supabase db reset` や `drizzle-kit push` を本番更新に使用しないでください。003適用後に問題があってもDBを削除せず、修正migrationで前進する運用です。既存の匿名IDやセッションストレージ名は変更しません。

### v1.1 DB追加項目と運用

| 対象                  | 追加項目                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| companies             | tags、aliases、seed_key（unique）                                                                                    |
| recruitment_templates | source_url、source_type、last_verified_at、verification_status、application_status、notes_public、seed_key（unique） |
| user_applications     | copied_application_deadline、last_verified_at、priorityの「未設定」                                                  |
| selection_steps       | state、所有者・親企業を含む一意制約                                                                                  |
| tasks                 | selection_step_id（unique、所有者付きFK）                                                                            |
| es_questions          | submitted_at、statusの「未着手」                                                                                     |
| interview_notes       | location_or_url、qa_pairs（JSON配列）                                                                                |
| user_preferences      | user_id、auto_create_tasks、auto_calendar                                                                            |
| watchlist             | user_id、recruitment_template_id、created_at（所有者と募集の組でunique）                                             |
| template_reports      | template_id、user_id、report_type、comment、created_at                                                               |

追加の個人テーブルにもRLSを適用しています。自分の訂正報告は自分とDB管理者のみ参照でき、公開テンプレートに本文を転載しません。報告の受付UIは実装済みですが、管理者向け審査画面・自動審査・メール送信はありません。管理者はSupabase Table Editorで `template_reports` を確認します。

一般ユーザーはverification/source/date列を直接変更できません。投稿RPCは公式URLと明示選択された公開フローだけを許可し、投稿者が送信したverified・私的メモなどの余剰項目を破棄します。投稿は常にuser_submitted / unverified。情報を確認した管理者がTable Editorで公式情報に基づくsource_type、source_url、last_verified_at、verification_status、application_status、日程を更新します。**verifiedにはofficialまたはcompany_mypageの非NULLのURLと最終確認日が必須**です。監視データを確認せずverified/open/upcomingに一括変更しないでください。

公開募集の締切更新はアプリで最大60秒ごと・画面復帰時に取得します。募集サイトの自動巡回ではありません。非公開化された募集の更新は通知できませんが、既存の個人コピーは残ります。

DB testsでは匿名JWT相当の2ユーザーを使ってES・面接・タスク・選考結果・志望度・メモ・設定・保存・報告を隔離し、コピー独立性、締切反映、タスク同期、引き継ぎ、seed件数／再実行、旧データ保全を検証します。初回サインイン／再訪セッションの維持はSDKモックで検証し、実Supabase Authのスモークテストは本番更新後に別途実施してください。

### 2026-09-23：定員締切・募集終了・同一企業の複数職種

- 企業／募集の編集で「締切の種類」を「定員に達し次第終了」にできます。日付は空欄で保存でき、最終締切が併記されている募集は日付も設定できます。日付がなければカレンダーに仮の日付は作りません。
- 「募集状況」は選考ステータスとは別に保存します。詳細の「募集終了にする」、または編集フォームで終了を記録できます。「募集中に戻す」で解除可能です。選考中・内定やES・面接・タスクは維持します。終了した募集はホームの応募予定候補と応募締切のリマインドから外れ、既存の面接・タスクは残ります。
- 自分の記録を終了にしても公開テンプレートや他ユーザーの記録は変更しません。自分が投稿した公開募集には「募集終了にする」ボタンがあり、他の投稿者の募集は「情報が違う」から報告できます。
- 企業一覧の標準表示は「企業ごと」です。同じ企業マスターIDを優先し、企業IDがない手入力の募集は企業名を全半角・英字大小・空白を正規化してまとめます。似ているだけの企業名や子会社は自動統合しません。テーブル／カード表示も継続利用できます。
- 「別の職種・募集を追加」は企業名・業界・卒年度のみをフォームへ引き継ぎます。詳細上部から募集を切り替えられ、募集ごとの締切・選考・ES・タスクは独立して保存します。元のデータやIDは統合・削除しません。
- 定員締切と募集状況は公開・引用・CSV往復に対応します。既存CSVも読み込み可能です。公開募集の締切種別が変わった場合も更新通知を表示し、「更新を反映」時にのみ個人側へ反映します。

**本番反映（003まで適用済みの場合）**

1. Supabase SQL Editorで `supabase/migrations/202609230004_capacity_deadlines.sql` を全文実行してください。列追加と関数更新のみで、既存データ・RLS・匿名ユーザーIDを保持します。既存の募集状況は「要確認」、締切種別は従来の日付指定になります。004は1回だけ実行してください。
2. `supabase/diagnostics/check_capacity_deadlines.sql` で列・関数・RLSの有無を確認できます。seedの再実行や環境変数追加は不要です。
3. コードをGitHubへ反映し、Vercelで再デプロイしてください。DB更新を先に行います。

ローカルでは `npm run lint`、`npm run test`、`npm run test:e2e`、`npm run build` で検証します。本番DBへのmigration適用・本番デプロイはこのコード変更だけでは行われません。
