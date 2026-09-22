import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  APP = "11111111-1111-4111-8111-111111111111";
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema auth; create schema extensions; create role anon; create role authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of ["202609220001_initial.sql", "202609220002_csv.sql"])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    `insert into auth.users values('${A}'),('${B}'); insert into public.anonymous_users(id) values('${A}'),('${B}');`,
  );
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("begin");
  await as(A);
  await db.query(
    "insert into user_applications(id,user_id,company_name,graduation_year,selection_type,memo) values($1,$2,'秘密の企業',2028,'本選考','private memo')",
    [APP, A],
  );
  await db.query(
    "insert into es_questions(user_id,user_application_id,question,answer) values($1,$2,'志望動機','private ES answer')",
    [A, APP],
  );
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
it("cannot read another user's applications or ES", async () => {
  await as(B);
  expect((await db.query("select * from user_applications")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from es_questions")).rows).toHaveLength(0);
});
it("rejects forged ownership", async () => {
  await as(B);
  await expect(
    db.query(
      "insert into tasks(user_id,user_application_id,title) values($1,$2,'attack')",
      [A, APP],
    ),
  ).rejects.toThrow();
});
it("rejects attaching a task to somebody else's application", async () => {
  await as(B);
  await expect(
    db.query(
      "insert into tasks(user_id,user_application_id,title) values($1,$2,'attack')",
      [B, APP],
    ),
  ).rejects.toThrow();
});
it("cannot update or delete another owner's data", async () => {
  await as(B);
  expect(
    (
      await db.query(
        "update user_applications set memo='attack' where id=$1 returning id",
        [APP],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("delete from es_questions returning id")).rows,
  ).toHaveLength(0);
});
it("publications are allowlisted and citations remain independent", async () => {
  const payload = {
    company_name: "共有企業",
    graduation_year: 2028,
    job_category: "ビジネス職",
    position_name: "2028卒",
    selection_type: "本選考",
    url: "",
    public_flow: [{ title: "一次面接", step_type: "一次面接", memo: "leak" }],
    memo: "private",
  };
  const id = (
    await db.query<{ id: string }>("select publish_template($1::jsonb) as id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  await as(B);
  const row = (
    await db.query("select * from recruitment_templates where id=$1", [id])
  ).rows[0];
  expect(JSON.stringify(row)).not.toContain("leak");
  expect(JSON.stringify(row)).not.toContain("private");
  const copy = (
    await db.query<{ id: string }>("select copy_template($1) as id", [id])
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select * from selection_steps where user_application_id=$1",
        [copy],
      )
    ).rows,
  ).toHaveLength(1);
  await as(A);
  await db.query("update recruitment_templates set public=false where id=$1", [
    id,
  ]);
  await as(B);
  expect(
    (await db.query("select * from recruitment_templates")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from user_applications where id=$1", [copy]))
      .rows,
  ).toHaveLength(1);
});
it("hides profile transfer hashes", async () => {
  await expect(
    db.query("select transfer_code_hash from anonymous_users"),
  ).rejects.toThrow();
});
it("moves child ownership atomically and rejects code reuse", async () => {
  const code = (
    await db.query<{ code: string }>("select issue_transfer_code() as code")
  ).rows[0].code;
  expect(code).toHaveLength(64);
  await as(B);
  expect(
    (
      await db.query<{ ok: boolean }>("select redeem_transfer_code($1) as ok", [
        code,
      ])
    ).rows[0].ok,
  ).toBe(true);
  expect((await db.query("select * from es_questions")).rows).toHaveLength(1);
  expect(
    (
      await db.query<{ ok: boolean }>("select redeem_transfer_code($1) as ok", [
        code,
      ])
    ).rows[0].ok,
  ).toBe(false);
  await as(A);
  expect((await db.query("select * from user_applications")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from es_questions")).rows).toHaveLength(0);
});
it("denies private tables to unauthenticated requests", async () => {
  await db.exec("reset role; set role anon;");
  await expect(db.query("select * from es_questions")).rejects.toThrow();
});
it("prevents direct template insertion", async () => {
  await expect(
    db.query(
      "insert into recruitment_templates(company_name,graduation_year,selection_type,job_category,position_name) values('bad',2028,'本選考','','')",
    ),
  ).rejects.toThrow();
});
it("rolls back CSV import if a child is invalid", async () => {
  const owned = (
    await db.query<Record<string, unknown>>("select * from user_applications")
  ).rows[0];
  const id = "22222222-2222-4222-8222-222222222222";
  await db.exec("savepoint before_import");
  await expect(
    db.query("select import_bundle($1::jsonb)", [
      JSON.stringify({
        applications: [{ ...owned, id }],
        steps: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            user_application_id: id,
            user_id: A,
            title: "invalid",
            step_type: "INVALID",
          },
        ],
        tasks: [],
      }),
    ]),
  ).rejects.toThrow();
  await db.exec("rollback to before_import");
  expect(
    (await db.query("select * from user_applications where id=$1", [id])).rows,
  ).toHaveLength(0);
});
