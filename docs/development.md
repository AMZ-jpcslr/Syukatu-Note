# 開発・検証・README画像

[READMEへ戻る](../README.md)

## チェック

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

依存関係は `pnpm install --frozen-lockfile` で揃えます。単体・DBテストには実Supabaseのキーは不要です。PGlite上に `auth.uid()` 相当のテスト用関数を置き、実際のmigrationを適用してRLS・複合FK・RPC・トランザクションを検証します。Supabase Authサービスのクラウド設定や本番環境を代替するものではありません。

E2Eは専用ポート3100でローカルデモを起動し、既存サーバーを再利用しません。既定ブラウザはMicrosoft Edgeです。Chromiumを使う場合：

```bash
pnpm exec playwright install chromium
# macOS / Linux
PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e
```

```powershell
# Windows PowerShell
$env:PLAYWRIGHT_CHANNEL = 'chromium'
pnpm test:e2e
```

`next dev` と `next build` は同じ `.next` を使うため、E2E／撮影とビルドを同時に実行しないでください。

## README画像の再撮影

掲載画像は2026年9月24日に、Playwrightで**実際のローカルアプリ**を開いて撮影しました。UIの合成画像ではありません。Supabase・本番アカウント・個人データは使いません。

```bash
pnpm exec playwright test --config playwright.docs.config.ts
```

設定：[playwright.docs.config.ts](../playwright.docs.config.ts)  
撮影処理：[capture-readme.spec.ts](../scripts/capture-readme.spec.ts)

このコマンドは専用デモサーバーを起動し、分離したブラウザで撮影して終了します。既定のEdgeがなければ、上記と同じ `PLAYWRIGHT_CHANNEL=chromium` を指定します。通常のE2Eテストとは設定を分けています。

- 出力先：[docs/images](images)
- デスクトップ：1440px幅、スマホ：iPhone 13相当
- ホーム、カレンダー、企業一覧、選考、募集検索、スマホ、ダークモードの7枚
- 企業・日程：アプリ標準の7社デモ。日程は撮影日に対する架空の相対日付
- 募集検索：既存の50社カタログをローカルブラウザに監視用テンプレートとして投入。日付はNULL、状態は未確認・要確認
- Next.js開発ツールだけを撮影時に非表示化。アプリUIは変更しない

撮り直すとPNGを上書きします。プレビューで文字・表示範囲・個人情報の混入がないことを確認し、READMEと一緒にコミットしてください。

## 整形と変更範囲

```bash
# READMEと関連ドキュメントのみ
pnpm exec prettier --check README.md "docs/**/*.md"
```

`pnpm format` はリポジトリ全体を書き換えるため、ドキュメントだけを直す場合は対象を絞ります。

## 実ページの確認

```bash
pnpm exec tsx scripts/check-recruitment-pages.ts
```

これはネットワークアクセスを伴います。Gemini・本番DBは使用しません。結果と制約は[自動取得の検証](recruitment-monitoring.md#検証と実ページ確認)を確認してください。

## 参考資料

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle and Supabase](https://orm.drizzle.team/docs/connect-supabase)
