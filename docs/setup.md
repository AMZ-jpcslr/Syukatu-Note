# セットアップ・本番更新

[READMEへ戻る](../README.md) · [自動取得の設定](recruitment-monitoring.md)

## ローカル起動

Node.js 22以上、pnpm 11.19.0を使います。

```bash
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile
```

`.env.example` をリポジトリ直下の `.env.local` にコピーして編集します。既存の設定は上書きしないでください。

```bash
pnpm dev
```

[localhost:3000](http://localhost:3000) を開きます。接続なしで試す場合は `NEXT_PUBLIC_DEMO_MODE=true`、Supabaseを使う場合は `false` にします。環境変数を変更したら開発サーバーを再起動します。

## Supabase設定

1. プロジェクトを作成し、**Authentication → Sign In / Providers → Anonymous Sign-Ins** を有効にします。
2. プロジェクトの **Connect** からProject URLを確認します。
3. **Settings → API Keys → Publishable and secret API keys** で `sb_publishable_...` の公開キーをコピーします。
4. 次節のmigrationとseedをSQL Editorで実行します。
5. **Authentication → URL Configuration** のSite URLをアプリのURLに設定します。
6. `.env.local` またはVercelに接続情報を設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_DEMO_MODE=false
```

公開キーはブラウザで利用するキーです。サーバー専用の `sb_secret_...` や `service_role` はここへ入れません。旧形式の公開 `anon` キーも利用でき、変数名 `NEXT_PUBLIC_SUPABASE_ANON_KEY` との互換性もあります。両方が設定されていれば空でないpublishable keyを優先します。

匿名セッションはアプリが自動生成します。メールアドレス・パスワードの登録UIはありません。公開テンプレートを閲覧する場合も、この匿名セッションを使用します。

匿名サインインのレート制限はSupabase側で設定します。CAPTCHAを有効にする場合は、アプリにトークン取得・送信の実装が必要です（現在のUIでは未実装）。匿名ユーザーを一律削除するジョブは設定しないでください。記録や引き継ぎ元のIDが失われます。

## DB migration

新規プロジェクトでは次の順に、各ファイルを**全文、一度ずつ**実行します。

| 順  | SQL                                                                                    | 内容                                                 |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 001 | [initial.sql](../supabase/migrations/202609220001_initial.sql)                         | テーブル、RLS、公開・引用・引き継ぎRPC               |
| 002 | [csv.sql](../supabase/migrations/202609220002_csv.sql)                                 | CSV一括追加と制約                                    |
| 003 | [v11.sql](../supabase/migrations/202609220003_v11.sql)                                 | 信頼性、watchlist、ES・面接拡張、選考とタスク連携    |
| 004 | [capacity_deadlines.sql](../supabase/migrations/202609230004_capacity_deadlines.sql)   | 定員締切、募集終了状況、コピー・CSV対応              |
| 005 | [recruitment_monitor.sql](../supabase/migrations/202609230005_recruitment_monitor.sql) | 監視URL、スナップショット、更新候補、ジョブ、承認RPC |

| 006 | [v2_import.sql](../supabase/migrations/202609240006_v2_import.sql) | 非公開Inbox・拡張ペアリング・Gmail・承認と出典・Today Planner |

### 既存環境の更新

- 対象プロジェクトを確認し、バックアップを確保してから**未適用のSQLだけ**を番号順に実行します。005まで適用済みなら006だけです。
- migrationはテーブル・列・権限・関数をまとめて変更します。途中の文だけを抜き出して実行しないでください。
- 001の再実行による `relation "anonymous_users" already exists` は、既存テーブルがあるという意味です。削除して作り直す対応はしません。
- SQL適用後にアプリを更新・デプロイします。既存の匿名IDやセッションのストレージ名は変更しません。
- 本番で `supabase db reset` や `drizzle-kit push` を使わないでください。問題があれば追加migrationで修正します。

読み取り専用の診断SQL：

- [check_setup.sql](../supabase/diagnostics/check_setup.sql)：初期オブジェクト・RLS
- [check_v11.sql](../supabase/diagnostics/check_v11.sql)：v1.1の列・関数・RLS・seed件数
- [check_capacity_deadlines.sql](../supabase/diagnostics/check_capacity_deadlines.sql)：定員締切の列・関数・RLS

Supabase CLIを使う場合：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

SQL Editorで手動適用した環境からCLIへ切り替える場合は、実DBとmigration履歴を照合してから使ってください。履歴が未登録のまま `db push` すると、適用済みSQLを再実行する可能性があります。DockerとCLIの `supabase start` / `supabase db reset` は、初期化してよいローカル環境に限って使用します。

DDL・RLS・RPCの正本は [supabase/migrations](../supabase/migrations) です。`src/db/schema.ts` はDrizzleの型付き定義です。`pnpm db:generate` の出力もレビューし、既存テーブルを重複作成しない追加migrationとして扱います。

v2の追加環境変数・拡張・ペアリング・Gmailは [v2導入手順](v2.md) を参照してください。適用確認：[check_v2.sql](../supabase/diagnostics/check_v2.sql)。

## 50社のseed

migration適用後に、SQL Editorで以下を順に実行します。

1. [supabase/seed.sql](../supabase/seed.sql)：企業マスターと2028卒の監視用公開テンプレート
2. [supabase/seed-recruitment-sources.sql](../supabase/seed-recruitment-sources.sql)：公式URLを監視対象へ追加

**どちらのseedも再実行できます。** 既存の具体的な募集・日程・監視設定は上書きしません。企業名・seed keyの一意制約などで重複を防ぎます。既に公式URL付きの2028卒公開募集がある企業は、その募集を優先します。

新規の監視テンプレートは以下の状態です。

- 募集名：2028卒 採用情報
- 募集種別：未発表、募集状況：unknown、確認状態：unverified
- 開始・締切・最終確認日：NULL、公開選考フロー：空
- タグ：企業の分野を示すもの。具体的な募集職種を保証しない

`seed.sql` の結果の `seeded_companies` と `companies_with_public_2028_templates` が各50、監視seedの `monitored_seed_companies` が50であることを確認します。既存企業があれば、DB全体の企業数は50を超えます。

```sql
select count(*) as seeded_companies
from public.companies
where seed_key like 'career-company-%';
```

CLIで50社seedを投入する場合は、Connectから取得した直接接続またはsession poolerのPostgreSQL URLを `.env.local` の `DATABASE_URL` に設定し、`pnpm db:seed` を実行します。監視URLのseedは別途SQLで実行します。旧7社の `pnpm db:seed:demo` は検証用で、本番の初期投入には50社seedを使います。

## 自動取得の追加設定

通常の企業・選考管理は公開キーで利用できます。公式ページのバックグラウンド取得には**サーバー専用キー**が別途必要です。

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_KEY
CRON_SECRET=YOUR_RANDOM_SECRET
RECRUITMENT_MONITOR_ENABLED=false
RECRUITMENT_AI_ENABLED=false
```

`SUPABASE_SERVICE_ROLE_KEY` の代わりに `SUPABASE_SECRET_KEY` も使用できます。キーは同じSupabaseプロジェクトのものを使い、`NEXT_PUBLIC_` を付けないでください。まず1社の手動取得とレビューを確認し、定期実行する場合に `RECRUITMENT_MONITOR_ENABLED=true` へ変更します。

`CRON_SECRET` は次のどちらかで生成できます。生成結果はVercelの環境変数へ保存し、Gitにコミットしません。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Node.jsなしで生成する場合（Windows PowerShell）：

```powershell
$cronBytes = New-Object byte[] 32
$cronRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $cronRng.GetBytes($cronBytes)
    [BitConverter]::ToString($cronBytes).Replace('-', '').ToLowerInvariant()
} finally {
    $cronRng.Dispose()
}
```

Geminiは任意です。全環境変数は [READMEの一覧](../README.md#環境変数)、レビュー権限とCronは[自動取得の運用](recruitment-monitoring.md)を確認してください。

## Vercelへのデプロイ

1. コードをGitHubリポジトリへ反映し、VercelからImportします。既存プロジェクトはそのまま更新します。
2. Framework Preset：**Next.js**、Root Directory：このアプリのディレクトリ。
3. Node.js：**22.x以上**、Install Command：`pnpm install --frozen-lockfile`、Build Command：`pnpm build`。Output Directoryは既定のまま。
4. Productionに環境変数を保存します。`NEXT_PUBLIC_DEMO_MODE=false` とし、自動取得を使う場合はサーバー専用キーも登録します。
5. DBの未適用migration・必要なseedを先に実行し、コードをデプロイします。`DATABASE_URL` は通常のVercel実行には不要です。
6. SupabaseのSite URLに本番URLを設定します。
7. 最新デプロイのVisitから実際の配信内容を確認します。

Previewは検証用Supabaseを分けるか、デモにすることを推奨します。Previewで定期監視を有効にしない運用にすると、本番との重複取得を避けられます。

更新確認：

- 企業を登録し、再読込しても同じ記録が残る
- 通常ブラウザとシークレットウィンドウで個人データが分離される
- 公開募集を別ブラウザから検索・引用でき、個人メモやESは共有されない
- 引用元を変更・非公開化しても個人コピーは残る
- 選考日程の変更がカレンダー・連携タスクへ反映される
- 引き継ぎコードで所有権が移り、元ブラウザから移行した私的記録が見えなくなる
- 自動取得を使う場合は、手動取得→レビュー→選択反映→カレンダーを確認する

## トラブルシューティング

### 「Supabase is not configured」「環境変数が未設定です」

1. Vercelの対象プロジェクト → Settings → Environment Variablesで、編集画面の**完全な変数名**と値を確認します。
2. `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` が空でないこと、同じプロジェクトの値であることを確認します。
3. Production（必要ならPreview）に保存し、最新コードで**新しいビルド**を作成します。切り分け時はRedeployの既存Build Cache利用を外します。
4. 最新デプロイのVisitから開き、そのデプロイに本番ドメインが紐づいているか確認します。

`NEXT_PUBLIC_` なしの `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` だけではブラウザ用ビルドを設定できません。自動取得のサーバー側では、空白・空欄を除外して公開側設定を優先し、連携が作る `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` にもフォールバックします。管理者用キーを公開キーで代用することはありません。

Vercelの非デモビルドは接続設定が不足すると、不足変数名をBuild Logsに表示して停止します。設定変更だけでなく、修正したコード自体もGitHub・デプロイへ反映されているか確認してください。SQLの再実行では環境変数不足は直りません。

### `relation "anonymous_users" already exists`

初期テーブルが既に存在します。001を再実行せず、診断SQLと適用履歴を確認して、未適用のmigrationだけ実行します。テーブルを削除する必要はありません。

### `node` が認識されない

Node.jsをインストールし、PowerShellを開き直して `node --version` を確認します。Cron秘密値だけが必要なら上記のPowerShell版を使えます。

### 自動取得がキューに残る

自動取得にはサーバー専用キーが必要です。定期処理は `RECRUITMENT_MONITOR_ENABLED=true`、`CRON_SECRET`、最新の `vercel.json` を確認します。一括キューの継続処理はCronが担当するため、50社が即時完了する仕様ではありません。取得エラーは更新候補画面で確認してください。
