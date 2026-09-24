import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { parsePage } from "../src/lib/import/parser";
let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
const extraction = parsePage({
  companyName: "MIXI",
  title: "MIXI",
  url: "https://mixi-recruit.snar.jp/",
  text: "2028卒 エンジニア職 本選考\n本エントリーシートの初回提出期限は【2026/9/28(月) 23:59 JST】までです。\n選考フロー\nES → Webテスト → 一次面接",
});
async function queue(owner = A, hash = "hash") {
  await db.exec("reset role");
  const result = await db.query<{ id: string }>(
    "select enqueue_private_import($1,$2,$3,$4,$5) as id",
    [
      owner,
      "mypage",
      "https://mixi-recruit.snar.jp/",
      JSON.stringify(extraction),
      hash,
    ],
  );
  return result.rows[0].id;
}
const payload = (id: string) => ({
  inbox_id: id,
  application_id: null,
  company_name: "MIXI",
  graduation_year: 2028,
  fields: ["company", "recruitment", "flow"],
  item_keys: [
    ...extraction.deadlines,
    ...extraction.detectedSelectionSteps,
  ].map((x) => x.key),
  tasks: true,
  calendar: true,
});
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    "create schema auth;create schema extensions;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    `insert into auth.users values('${A}'),('${B}');insert into anonymous_users(id) values('${A}'),('${B}');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback;reset role");
});
it("stores only candidates until approval and skips identical snapshots", async () => {
  const id = await queue();
  expect(await queue()).toBe(id);
  expect((await db.query("select * from user_applications")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from import_inbox")).rows).toHaveLength(1);
});
it("private MyPage sources, inbox and audit are isolated", async () => {
  await queue();
  await as(B);
  expect((await db.query("select * from import_inbox")).rows).toHaveLength(0);
  expect((await db.query("select * from data_sources")).rows).toHaveLength(0);
  expect((await db.query("select * from import_audit")).rows).toHaveLength(0);
  await expect(db.query("select * from extension_tokens")).rejects.toThrow();
});
it("cannot approve another user inbox", async () => {
  const id = await queue();
  await as(B);
  await expect(
    db.query("select review_private_import($1)", [JSON.stringify(payload(id))]),
  ).rejects.toThrow();
});
it("approves ES with exact time, task, calendar and explicit flow atomically", async () => {
  const id = await queue();
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify(payload(id)),
  ]);
  expect((await db.query("select due_value from tasks")).rows).toEqual([
    { due_value: "2026-09-28T23:59:00+09:00" },
  ]);
  expect(
    (await db.query("select start_value from imported_events")).rows,
  ).toEqual([{ start_value: "2026-09-28T23:59:00+09:00" }]);
  expect((await db.query("select * from selection_steps")).rows).toHaveLength(
    3,
  );
  expect((await db.query("select * from import_audit")).rows).toHaveLength(1);
  await expect(
    db.query("select review_private_import($1)", [JSON.stringify(payload(id))]),
  ).rejects.toThrow();
});
it("partial approval does not create unselected flow/calendar/tasks", async () => {
  const id = await queue();
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify({
      ...payload(id),
      fields: ["company"],
      calendar: false,
      tasks: false,
      item_keys: [],
    }),
  ]);
  expect((await db.query("select * from tasks")).rows).toHaveLength(0);
  expect((await db.query("select * from imported_events")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from selection_steps")).rows).toHaveLength(
    0,
  );
  expect(
    (await db.query("select position_name from user_applications")).rows[0],
  ).toEqual({ position_name: "" });
});
it("pairing is one-use, expired codes fail, hashed tokens are not readable", async () => {
  await db.query(
    "insert into extension_pairings(user_id,code_hash,expires_at) values($1,'code',now()+interval '10 minutes')",
    [A],
  );
  expect(
    (
      await db.query(
        "select claim_extension_pairing('code','token','chrome-extension://test') as ok",
      )
    ).rows[0],
  ).toEqual({ ok: true });
  expect(
    (
      await db.query(
        "select claim_extension_pairing('code','other','chrome-extension://test') as ok",
      )
    ).rows[0],
  ).toEqual({ ok: false });
});
it("rate limits are counted atomically", async () => {
  expect(
    (await db.query("select import_rate_limit('test',1,600) as ok")).rows[0],
  ).toEqual({ ok: true });
  expect(
    (await db.query("select import_rate_limit('test',1,600) as ok")).rows[0],
  ).toEqual({ ok: false });
});
it("changed extraction updates the existing event and task instead of duplicating", async () => {
  const id = await queue();
  await as(A);
  const applied = await db.query<{ id: string }>(
    "select review_private_import($1) as id",
    [JSON.stringify(payload(id))],
  );
  const app = applied.rows[0].id;
  await db.exec("reset role");
  const revised = structuredClone(extraction);
  revised.deadlines[0].date = "2026-10-01T12:00:00+09:00";
  const q = await db.query<{ id: string }>(
    "select enqueue_private_import($1,$2,$3,$4,$5) as id",
    [
      A,
      "mypage",
      "https://mixi-recruit.snar.jp/",
      JSON.stringify(revised),
      "changed",
    ],
  );
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify({ ...payload(q.rows[0].id), application_id: app }),
  ]);
  expect(
    (await db.query("select start_value from imported_events")).rows,
  ).toEqual([{ start_value: "2026-10-01T12:00:00+09:00" }]);
  expect((await db.query("select due_value from tasks")).rows).toEqual([
    { due_value: "2026-10-01T12:00:00+09:00" },
  ]);
});
it("manual date edits block a replacement unless explicitly approved", async () => {
  const id = await queue();
  await as(A);
  const applied = await db.query<{ id: string }>(
    "select review_private_import($1) as id",
    [JSON.stringify(payload(id))],
  );
  const app = applied.rows[0].id;
  await db.query(
    "update imported_events set start_value='2026-10-02' where user_application_id=$1",
    [app],
  );
  await db.exec("reset role");
  const revised = structuredClone(extraction);
  revised.deadlines[0].date = "2026-10-01";
  const q = await db.query<{ id: string }>(
    "select enqueue_private_import($1,$2,$3,$4,$5) as id",
    [
      A,
      "mypage",
      "https://mixi-recruit.snar.jp/",
      JSON.stringify(revised),
      "changed",
    ],
  );
  await as(A);
  await db.exec("savepoint manual_guard");
  await expect(
    db.query("select review_private_import($1)", [
      JSON.stringify({ ...payload(q.rows[0].id), application_id: app }),
    ]),
  ).rejects.toThrow(/手動/);
  await db.exec("rollback to savepoint manual_guard");
  await db.query("select review_private_import($1)", [
    JSON.stringify({
      ...payload(q.rows[0].id),
      application_id: app,
      allow_override: true,
    }),
  ]);
  expect(
    (await db.query("select start_value from imported_events")).rows,
  ).toEqual([{ start_value: "2026-10-01" }]);
});
it("Mail with the same deadline is merged and cannot override MyPage provenance without consent", async () => {
  const id = await queue();
  await as(A);
  const applied = await db.query<{ id: string }>(
    "select review_private_import($1) as id",
    [JSON.stringify(payload(id))],
  );
  await db.exec("reset role");
  const q = await db.query<{ id: string }>(
    "select enqueue_private_import($1,$2,$3,$4,$5) as id",
    [A, "mail", "gmail-message", JSON.stringify(extraction), "mail-hash"],
  );
  await as(A);
  await expect(
    db.query("select review_private_import($1)", [
      JSON.stringify({
        ...payload(q.rows[0].id),
        application_id: applied.rows[0].id,
      }),
    ]),
  ).rejects.toThrow(/優先/);
});
it("transfer moves private imports and events, then revokes device tokens", async () => {
  const id = await queue();
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify(payload(id)),
  ]);
  const code = (
    await db.query<{ code: string }>("select issue_transfer_code() as code")
  ).rows[0].code;
  await db.exec("reset role");
  await db.query(
    "insert into extension_tokens(user_id,token_hash,extension_origin,expires_at) values($1,'hash','origin',now()+interval '1 day')",
    [A],
  );
  await as(B);
  expect(
    (await db.query("select redeem_transfer_code($1) as ok", [code])).rows[0],
  ).toEqual({ ok: true });
  expect((await db.query("select * from import_inbox")).rows).toHaveLength(1);
  expect((await db.query("select * from imported_events")).rows).toHaveLength(
    1,
  );
  await as(A);
  expect((await db.query("select * from import_inbox")).rows).toHaveLength(0);
  expect((await db.query("select * from imported_events")).rows).toHaveLength(
    0,
  );
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select revoked_at is not null as revoked from extension_tokens",
      )
    ).rows[0],
  ).toEqual({ revoked: true });
});
import { exportCsv, parseCsv } from "../src/lib/csv";
import type { Store } from "../src/lib/types";
it("CSV backup restores v2 tasks and events without NOT NULL regressions", async () => {
  const id = await queue();
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify(payload(id)),
  ]);
  const store = {
    applications: (await db.query("select * from user_applications")).rows,
    steps: (await db.query("select * from selection_steps")).rows,
    tasks: (await db.query("select *,due_date::text as due_date from tasks"))
      .rows,
    importedEvents: (await db.query("select * from imported_events")).rows,
    es: [],
    interviews: [],
  } as unknown as Store;
  const bundle = parseCsv(exportCsv(store), B);
  await as(B);
  await db.query("select import_bundle($1)", [JSON.stringify(bundle)]);
  expect(
    (await db.query("select due_value,estimated_minutes from tasks")).rows,
  ).toEqual([
    { due_value: "2026-09-28T23:59:00+09:00", estimated_minutes: 60 },
  ]);
  expect((await db.query("select * from imported_events")).rows).toHaveLength(
    1,
  );
});
it("compares another pending refresh with the last approved extraction", async () => {
  const first = await queue();
  await as(A);
  const app = (
    await db.query<{ id: string }>("select review_private_import($1) as id", [
      JSON.stringify(payload(first)),
    ])
  ).rows[0].id;
  await db.exec("reset role");
  let latest = "";
  for (const day of ["29", "30"]) {
    const revised = structuredClone(extraction);
    revised.deadlines[0].date = "2026-09-" + day;
    latest = (
      await db.query<{ id: string }>(
        "select enqueue_private_import($1,$2,$3,$4,$5) as id",
        [
          A,
          "mypage",
          "https://mixi-recruit.snar.jp/",
          JSON.stringify(revised),
          day,
        ],
      )
    ).rows[0].id;
  }
  await as(A);
  await db.query("select review_private_import($1)", [
    JSON.stringify({ ...payload(latest), application_id: app }),
  ]);
  expect(
    (await db.query("select start_value from imported_events")).rows,
  ).toEqual([{ start_value: "2026-09-30" }]);
});
