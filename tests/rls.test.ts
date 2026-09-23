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
  await db.exec(`create schema auth; create schema extensions; create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of [
    "202609220001_initial.sql",
    "202609220002_csv.sql",
    "202609220003_v11.sql",
    "202609230004_capacity_deadlines.sql",
    "202609230005_recruitment_monitor.sql",
  ])
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
    url: "https://example.com/recruit",
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
it("isolates interviews, tasks, step results, priority and private notes", async () => {
  await db.query(
    "insert into interview_notes(user_id,user_application_id,scheduled_at,stage,format,reflection,qa_pairs) values($1,$2,now(),'一次面接','オンライン','private interview','[{\"question\":\"secret\",\"answer\":\"secret\"}]')",
    [A, APP],
  );
  await db.query(
    "insert into selection_steps(user_id,user_application_id,title,step_type,deadline,result,memo) values($1,$2,'ES','ES締切','2028-10-01','secret result','secret step')",
    [A, APP],
  );
  expect((await db.query("select * from tasks")).rows).toHaveLength(1);
  await as(B);
  for (const table of [
    "user_applications",
    "interview_notes",
    "selection_steps",
    "tasks",
    "es_questions",
  ])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
});
it("creates one linked task, updates its deadline, and synchronizes completion", async () => {
  const {
    rows: [step],
  } = await db.query<{ id: string }>(
    "insert into selection_steps(user_id,user_application_id,title,step_type,deadline) values($1,$2,'ES締切','ES締切','2028-10-01') returning id",
    [A, APP],
  );
  await db.query(
    "update selection_steps set deadline='2028-10-03' where id=$1",
    [step.id],
  );
  const tasks = (
    await db.query<{ id: string; title: string; due_date: string }>(
      "select * from tasks",
    )
  ).rows;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("ES提出");
  expect(new Date(tasks[0].due_date).toISOString().slice(0, 10)).toBe(
    "2028-10-03",
  );
  await db.query("update tasks set completed=true where id=$1", [tasks[0].id]);
  expect(
    (
      await db.query<{ state: string }>(
        "select state from selection_steps where id=$1",
        [step.id],
      )
    ).rows[0].state,
  ).toBe("完了");
  await db.query("update selection_steps set state='進行中' where id=$1", [
    step.id,
  ]);
  expect(
    (await db.query<{ completed: boolean }>("select completed from tasks"))
      .rows[0].completed,
  ).toBe(false);
});
it("supports schedule-only tasks in JST and automation OFF without deleting existing tasks", async () => {
  await db.query(
    "insert into selection_steps(user_id,user_application_id,title,step_type,scheduled_at) values($1,$2,'面接','一次面接','2028-10-01T16:00:00Z')",
    [A, APP],
  );
  expect(
    (await db.query<{ due_date: string }>("select due_date::text from tasks"))
      .rows[0].due_date,
  ).toBe("2028-10-02");
  await db.query(
    "insert into user_preferences(user_id,auto_create_tasks) values($1,false)",
    [A],
  );
  await db.query(
    "insert into selection_steps(user_id,user_application_id,title,step_type,deadline) values($1,$2,'テスト','Webテスト','2028-10-01')",
    [A, APP],
  );
  expect((await db.query("select * from tasks")).rows).toHaveLength(1);
});
it("keeps copied applications independent and applies a deadline only on explicit request", async () => {
  const payload = {
    company_name: "変更テスト",
    graduation_year: 2028,
    selection_type: "本選考",
    url: "https://example.com/jobs",
    application_deadline: "2028-10-01",
  };
  const tid = (
    await db.query<{ id: string }>("select publish_template($1) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  await as(B);
  const aid = (
    await db.query<{ id: string }>("select copy_template($1) id", [tid])
  ).rows[0].id;
  const original = (
    await db.query<{
      priority: string;
      status: string;
      copied_application_deadline: string;
    }>("select * from user_applications where id=$1", [aid])
  ).rows[0];
  expect(original.priority).toBe("未設定");
  expect(original.status).toBe("応募予定");
  expect(
    new Date(original.copied_application_deadline).toISOString().slice(0, 10),
  ).toBe("2028-10-01");
  await db.query(
    "update user_applications set memo='mine',application_deadline='2028-10-02' where id=$1",
    [aid],
  );
  await db.exec("reset role");
  await db.query(
    "update recruitment_templates set application_deadline='2028-10-05' where id=$1",
    [tid],
  );
  await as(B);
  expect(
    (
      await db.query<{ application_deadline: string }>(
        "select application_deadline::text from user_applications where id=$1",
        [aid],
      )
    ).rows[0].application_deadline,
  ).toBe("2028-10-02");
  await db.query("select apply_template_deadline($1,'2028-10-05')", [aid]);
  const updated = (
    await db.query<{
      memo: string;
      application_deadline: string;
      copied_application_deadline: string;
    }>("select * from user_applications where id=$1", [aid])
  ).rows[0];
  expect(updated.memo).toBe("mine");
  expect(
    new Date(updated.application_deadline).toISOString().slice(0, 10),
  ).toBe("2028-10-05");
  expect(
    new Date(updated.copied_application_deadline).toISOString().slice(0, 10),
  ).toBe("2028-10-05");
});
it("rejects a stale deadline revision without changing the personal application", async () => {
  const tid = (
    await db.query<{ id: string }>("select publish_template($1) id", [
      JSON.stringify({
        company_name: "revision",
        graduation_year: 2028,
        selection_type: "本選考",
        url: "https://example.com",
        application_deadline: "2028-11-01",
      }),
    ])
  ).rows[0].id;
  const aid = (
    await db.query<{ id: string }>("select copy_template($1) id", [tid])
  ).rows[0].id;
  await expect(
    db.query("select apply_template_deadline($1,'2028-10-01')", [aid]),
  ).rejects.toThrow();
});
it("never promotes user-supplied verification claims and rejects publication without an official URL", async () => {
  const payload = {
    company_name: "unverified",
    graduation_year: 2028,
    selection_type: "未発表",
    url: "https://example.com",
    verification_status: "verified",
    source_type: "official",
    last_verified_at: new Date().toISOString(),
    notes_public: "private injected note",
  };
  await db.query("select publish_template($1)", [JSON.stringify(payload)]);
  const row = (
    await db.query<{ verification_status: string; notes_public: string }>(
      "select * from recruitment_templates",
    )
  ).rows[0];
  expect(row.verification_status).toBe("unverified");
  expect(row.notes_public).toBe("");
  await expect(
    db.query("select publish_template($1)", [
      JSON.stringify({ ...payload, url: "" }),
    ]),
  ).rejects.toThrow();
});
it("hides legacy public templates without URLs from other users", async () => {
  await db.exec("reset role");
  const c = (
    await db.query<{ id: string }>(
      "insert into companies(name) values('legacy') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into recruitment_templates(company_id,company_name,graduation_year,selection_type,created_by_user_id,public) values($1,'legacy',2028,'本選考',$2,true)",
    [c, A],
  );
  await as(A);
  expect(
    (await db.query("select * from recruitment_templates")).rows,
  ).toHaveLength(1);
  await as(B);
  expect(
    (await db.query("select * from recruitment_templates")).rows,
  ).toHaveLength(0);
});
it("isolates watchlists, reports and preferences, and transfers them with the existing code", async () => {
  const tid = (
    await db.query<{ id: string }>("select publish_template($1) id", [
      JSON.stringify({
        company_name: "watch",
        graduation_year: 2028,
        selection_type: "未発表",
        url: "https://example.com",
      }),
    ])
  ).rows[0].id;
  await db.query(
    "insert into watchlist(user_id,recruitment_template_id) values($1,$2)",
    [A, tid],
  );
  await db.query(
    "insert into template_reports(user_id,template_id,report_type,comment) values($1,$2,'URLが違う','private report')",
    [A, tid],
  );
  await db.query(
    "insert into user_preferences(user_id,auto_calendar) values($1,false)",
    [A],
  );
  const code = (
    await db.query<{ code: string }>("select issue_transfer_code() code")
  ).rows[0].code;
  await as(B);
  for (const t of ["watchlist", "template_reports", "user_preferences"])
    expect((await db.query(`select * from ${t}`)).rows).toHaveLength(0);
  await db.query("select redeem_transfer_code($1)", [code]);
  for (const t of ["watchlist", "template_reports", "user_preferences"])
    expect((await db.query(`select * from ${t}`)).rows).toHaveLength(1);
});
it("reorders all steps atomically and preserves results", async () => {
  const ids: string[] = [];
  for (const title of ["ES", "一次面接"])
    ids.push(
      (
        await db.query<{ id: string }>(
          "insert into selection_steps(user_id,user_application_id,title,step_type,result) values($1,$2,$3,'その他','private') returning id",
          [A, APP, title],
        )
      ).rows[0].id,
    );
  await db.query("select reorder_steps($1,$2::uuid[])", [
    APP,
    [...ids].reverse(),
  ]);
  const rows = (
    await db.query<{ title: string; result: string }>(
      "select title,result from selection_steps order by order_index",
    )
  ).rows;
  expect(rows.map((s) => s.title)).toEqual(["一次面接", "ES"]);
  expect(rows.every((s) => s.result === "private")).toBe(true);
});
it("seeds all 50 masters idempotently without changing existing recruitment dates or private records", async () => {
  await db.exec("reset role");
  const c = (
    await db.query<{ id: string }>(
      "insert into companies(name,industry) values('マネーフォワード','既存業界') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into recruitment_templates(company_id,company_name,graduation_year,selection_type,position_name,application_deadline,url,source_url,public) values($1,'マネーフォワード',2028,'本選考','既存の具体的募集','2028-10-10','https://example.com','https://example.com',true)",
    [c],
  );
  const seed = readFileSync("supabase/seed.sql", "utf8")
    .replace(/^begin;$/gm, "")
    .replace(/^commit;$/gm, "");
  await db.exec(seed);
  const count = async (table: string) =>
    Number(
      (await db.query<{ n: number }>(`select count(*) n from ${table}`)).rows[0]
        .n,
    );
  const first = await count("recruitment_templates");
  await db.exec(seed);
  expect(await count("companies")).toBe(50);
  expect(await count("recruitment_templates")).toBe(first);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*) n from companies where seed_key like 'career-company-%'",
      )
    ).rows[0].n,
  ).toBe(50);
  expect(
    (
      await db.query<{ industry: string }>(
        "select industry from companies where id=$1",
        [c],
      )
    ).rows[0].industry,
  ).toBe("既存業界");
  expect(
    (
      await db.query<{ application_deadline: string }>(
        "select application_deadline::text from recruitment_templates where company_id=$1",
        [c],
      )
    ).rows[0].application_deadline,
  ).toBe("2028-10-10");
  expect(
    (
      await db.query(
        "select * from recruitment_templates where seed_key is not null and (application_start is not null or application_deadline is not null or verification_status<>'unverified' or application_status<>'unknown')",
      )
    ).rows,
  ).toHaveLength(0);
  expect(await count("es_questions")).toBe(1);
  console.log(
    "Seed verification: SELECT COUNT(*) = 50 company masters; second execution has no duplicates.",
  );
});
it("handles PostgREST-style upsert when reopening a completed selection", async () => {
  const sid = (
    await db.query<{ id: string }>(
      "insert into selection_steps(user_id,user_application_id,title,step_type,completed) values($1,$2,'ES','ES締切',true) returning id",
      [A, APP],
    )
  ).rows[0].id;
  await db.query(
    "insert into selection_steps(id,user_id,user_application_id,title,step_type,state,completed) values($1,$2,$3,'ES','ES締切','完了',false) on conflict(id) do update set state=excluded.state,completed=excluded.completed",
    [sid, A, APP],
  );
  expect(
    (
      await db.query(
        "select state,completed from selection_steps where id=$1",
        [sid],
      )
    ).rows[0],
  ).toEqual({ state: "未着手", completed: false });
});
it("rejects verified metadata without a non-null official source even for admin writes", async () => {
  await db.exec("reset role");
  const cid = (
    await db.query<{ id: string }>(
      "insert into companies(name) values('source-test') returning id",
    )
  ).rows[0].id;
  await expect(
    db.query(
      "insert into recruitment_templates(company_id,company_name,graduation_year,selection_type,source_type,verification_status,last_verified_at) values($1,'source-test',2028,'未発表','official','verified',now())",
      [cid],
    ),
  ).rejects.toThrow();
});
it("rejects public flow entries with missing types before others can copy them", async () => {
  await expect(
    db.query("select publish_template($1)", [
      JSON.stringify({
        company_name: "invalid-flow",
        graduation_year: 2028,
        selection_type: "本選考",
        url: "https://example.com",
        public_flow: [{ title: "面接" }],
      }),
    ]),
  ).rejects.toThrow();
});
it("does not expose a third-party source alone as an official application URL", async () => {
  await db.exec("reset role");
  const cid = (
    await db.query<{ id: string }>(
      "insert into companies(name) values('third-party-only') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into recruitment_templates(company_id,company_name,graduation_year,selection_type,source_url,source_type,public,created_by_user_id) values($1,'third-party-only',2028,'未発表','https://example.com/news','third_party',true,$2)",
    [cid, A],
  );
  await as(B);
  expect(
    (await db.query("select * from recruitment_templates")).rows,
  ).toHaveLength(0);
});
it("transfers linked selection tasks through both ownership foreign keys", async () => {
  const sid = (
    await db.query<{ id: string }>(
      "insert into selection_steps(user_id,user_application_id,title,step_type,deadline) values($1,$2,'ES','ES締切','2028-10-01') returning id",
      [A, APP],
    )
  ).rows[0].id;
  await db.query(
    "update tasks set memo='keep task memo' where selection_step_id=$1",
    [sid],
  );
  const code = (
    await db.query<{ code: string }>("select issue_transfer_code() code")
  ).rows[0].code;
  await as(B);
  expect(
    (
      await db.query<{ ok: boolean }>("select redeem_transfer_code($1) ok", [
        code,
      ])
    ).rows[0].ok,
  ).toBe(true);
  expect(
    (await db.query("select user_id,selection_step_id,memo from tasks")).rows,
  ).toEqual([{ user_id: B, selection_step_id: sid, memo: "keep task memo" }]);
  await db.query("update tasks set completed=true where selection_step_id=$1", [
    sid,
  ]);
  expect(
    (
      await db.query<{ completed: boolean }>(
        "select completed from selection_steps where id=$1",
        [sid],
      )
    ).rows[0].completed,
  ).toBe(true);
  await as(A);
  expect((await db.query("select * from tasks")).rows).toHaveLength(0);
});

it("copies capacity deadlines and isolates personal and published closure state", async () => {
  const template = (
    await db.query<{ id: string }>("select publish_template($1::jsonb) as id", [
      JSON.stringify({
        company_name: "定員テスト",
        graduation_year: 2028,
        job_category: "企画",
        position_name: "企画職",
        selection_type: "本選考",
        url: "https://example.com/jobs",
        application_deadline: null,
        deadline_type: "capacity",
        application_status: "open",
        public_flow: [],
      }),
    ])
  ).rows[0].id;
  await as(B);
  const copy = (
    await db.query<{ id: string }>("select copy_template($1) as id", [template])
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select deadline_type,copied_deadline_type,application_deadline,application_status from user_applications where id=$1",
        [copy],
      )
    ).rows[0],
  ).toEqual({
    deadline_type: "capacity",
    copied_deadline_type: "capacity",
    application_deadline: null,
    application_status: "open",
  });
  expect(
    (
      await db.query(
        "update recruitment_templates set application_status='closed' where id=$1 returning id",
        [template],
      )
    ).rows,
  ).toHaveLength(0);
  await db.query(
    "update user_applications set application_status='closed',status='選考中' where id=$1",
    [copy],
  );
  await as(A);
  expect(
    (
      await db.query(
        "select application_status from recruitment_templates where id=$1",
        [template],
      )
    ).rows[0],
  ).toEqual({ application_status: "open" });
  await db.query(
    "update recruitment_templates set application_status='closed' where id=$1",
    [template],
  );
  await db.exec("reset role");
  await db.query(
    "update recruitment_templates set deadline_type='date',application_deadline='2028-10-10' where id=$1",
    [template],
  );
  await as(B);
  expect(
    (
      await db.query(
        "select deadline_type,status from user_applications where id=$1",
        [copy],
      )
    ).rows[0],
  ).toEqual({ deadline_type: "capacity", status: "選考中" });
  await db.query(
    "select apply_template_deadline_details($1,'2028-10-10','date')",
    [copy],
  );
  expect(
    (
      await db.query(
        "select deadline_type,application_status,status from user_applications where id=$1",
        [copy],
      )
    ).rows[0],
  ).toEqual({
    deadline_type: "date",
    application_status: "closed",
    status: "選考中",
  });
});

async function monitorFixture(privateSource = false) {
  const t = (
    await db.query<{ id: string }>("select publish_template($1::jsonb) as id", [
      JSON.stringify({
        company_name: "監視企業",
        graduation_year: 2028,
        job_category: "Software Engineer",
        position_name: "28卒 SWE",
        selection_type: "本選考",
        url: "https://example.com/jobs",
        application_deadline: null,
        public_flow: [],
      }),
    ])
  ).rows[0].id;
  await db.exec("reset role");
  const company = (
    await db.query<{ company_id: string }>(
      "select company_id from recruitment_templates where id=$1",
      [t],
    )
  ).rows[0].company_id;
  const source = (
    await db.query<{ id: string }>(
      "insert into company_sources(company_id,company_name,owner_user_id,source_type,url) values($1,'監視企業',$2,'recruitment','https://example.com/jobs') returning id",
      [company, privateSource ? A : null],
    )
  ).rows[0].id;
  const evidence = {
    source_url: "https://example.com/jobs",
    source_page_title: "28卒 SWE",
    evidence_text: "締切 2026年10月16日正午",
  };
  const flow = [
    {
      title: "ES",
      type: "ES",
      deadline: "2026-10-10",
      scheduled_at: null,
      order_index: 0,
      evidence,
    },
  ];
  const raw = {
    company_name: "監視企業",
    graduation_year: 2028,
    position_name: "28卒 SWE",
    selection_type: "本選考",
    application_deadline: "2026-10-16T12:00:00+09:00",
    selection_steps: flow,
  };
  const diff = {
    application_deadline: {
      before: null,
      after: raw.application_deadline,
      evidence,
    },
    selection_steps: { before: [], after: flow, evidence },
  };
  const candidate = (
    await db.query<{ id: string }>(
      "insert into recruitment_update_candidates(company_id,template_id,source_id,owner_user_id,source_url,parser_type,raw_extracted_json,diff_json,confidence,fingerprint) values($1,$2,$3,$4,'https://example.com/jobs','rule',$5,$6,.9,'test') returning id",
      [
        company,
        t,
        source,
        privateSource ? A : null,
        JSON.stringify(raw),
        JSON.stringify(diff),
      ],
    )
  ).rows[0].id;
  await as(A);
  return { t, source, candidate, company, raw, diff };
}
it("only human-approved fields update a template and copies remain independent", async () => {
  const f = await monitorFixture();
  const copy = (
    await db.query<{ id: string }>("select copy_template($1) as id", [f.t])
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select application_deadline from recruitment_templates where id=$1",
        [f.t],
      )
    ).rows[0],
  ).toEqual({ application_deadline: null });
  await db.query(
    "select review_recruitment_candidate($1,array['application_deadline'],'public',null,false,false)",
    [f.candidate],
  );
  expect(
    (
      await db.query(
        "select application_deadline_value,public_flow from recruitment_templates where id=$1",
        [f.t],
      )
    ).rows[0],
  ).toEqual({
    application_deadline_value: "2026-10-16T12:00:00+09:00",
    public_flow: [],
  });
  expect(
    (
      await db.query(
        "select application_deadline from user_applications where id=$1",
        [copy],
      )
    ).rows[0],
  ).toEqual({ application_deadline: null });
  expect(
    (
      await db.query(
        "select status from recruitment_update_candidates where id=$1",
        [f.candidate],
      )
    ).rows[0],
  ).toEqual({ status: "partially_approved" });
});
it("anonymous users can import public candidates personally, create tasks and keep private details private", async () => {
  const f = await monitorFixture();
  await as(B);
  const app = (
    await db.query<{ id: string }>(
      "select review_recruitment_candidate($1,array['application_deadline','selection_steps'],'personal',null,true,true) as id",
      [f.candidate],
    )
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select application_deadline_value,status from user_applications where id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({
    application_deadline_value: "2026-10-16T12:00:00+09:00",
    status: "応募予定",
  });
  expect(
    (
      await db.query(
        "select title,due_date::text from tasks where user_application_id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({ title: "ES作成・提出", due_date: "2026-10-10" });
  expect(
    (
      await db.query(
        "select deadline_value,calendar_enabled from selection_steps where user_application_id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({ deadline_value: "2026-10-10", calendar_enabled: true });
  await as(A);
  expect(
    (await db.query("select * from tasks where user_application_id=$1", [app]))
      .rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select application_deadline from recruitment_templates where id=$1",
        [f.t],
      )
    ).rows[0],
  ).toEqual({ application_deadline: null });
});
it("calendar/task opt-out is persisted", async () => {
  const f = await monitorFixture();
  const app = (
    await db.query<{ id: string }>(
      "select review_recruitment_candidate($1,array['application_deadline','selection_steps'],'personal',null,false,false) as id",
      [f.candidate],
    )
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select calendar_exclusions from user_applications where id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({ calendar_exclusions: ["application_deadline"] });
  expect(
    (await db.query("select * from tasks where user_application_id=$1", [app]))
      .rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select calendar_enabled from selection_steps where user_application_id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({ calendar_enabled: false });
});
it("blocks unauthorized public approval", async () => {
  const f = await monitorFixture();
  await as(B);
  await expect(
    db.query(
      "select review_recruitment_candidate($1,array['application_deadline'],'public',null,false,false)",
      [f.candidate],
    ),
  ).rejects.toThrow("権限");
});
it("private source candidates and snapshots cannot be read by another anonymous user", async () => {
  const f = await monitorFixture(true);
  await as(B);
  expect(
    (
      await db.query(
        "select * from recruitment_update_candidates where id=$1",
        [f.candidate],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from company_sources where id=$1", [f.source]))
      .rows,
  ).toHaveLength(0);
});
it("blocks cohort reassignment during review", async () => {
  const f = await monitorFixture();
  await expect(
    db.query(
      "select review_recruitment_candidate($1,array['application_deadline'],'personal',null,false,false,null,2029)",
      [f.candidate],
    ),
  ).rejects.toThrow("別年度");
});
it("stale public candidates cannot overwrite newer manual changes", async () => {
  const f = await monitorFixture();
  await db.exec("reset role");
  await db.query(
    "update recruitment_templates set application_deadline='2026-11-01' where id=$1",
    [f.t],
  );
  await as(A);
  await expect(
    db.query(
      "select review_recruitment_candidate($1,array['application_deadline'],'public',null,false,false)",
      [f.candidate],
    ),
  ).rejects.toThrow("元の募集情報");
});
it("batch jobs use leases, completion stores only candidates, and retries deduplicate", async () => {
  const f = await monitorFixture();
  const j = (
    await db.query<{ id: string }>(
      "select request_recruitment_check($1) as id",
      [f.source],
    )
  ).rows[0].id;
  expect(
    (
      await db.query<{ id: string }>(
        "select request_recruitment_check($1) as id",
        [f.source],
      )
    ).rows[0].id,
  ).toBe(j);
  await db.exec("reset role");
  const job = (
    await db.query<{ lease_token: string }>(
      "select * from claim_recruitment_job($1)",
      [j],
    )
  ).rows[0];
  expect(
    (await db.query("select * from claim_recruitment_job($1)", [j])).rows,
  ).toHaveLength(0);
  await db.query("select complete_recruitment_job($1,$2,$3,$4,'success',1,0)", [
    j,
    job.lease_token,
    JSON.stringify({
      content_hash: "abc",
      content_text: "public",
      page_title: "title",
      pages_json: [],
    }),
    JSON.stringify([
      {
        template_id: f.t,
        source_url: "https://example.com/jobs",
        parser_type: "rule",
        raw_extracted_json: f.raw,
        diff_json: f.diff,
        confidence: 0.9,
        important_update: true,
        fingerprint: "test",
      },
    ]),
  ]);
  expect(
    (
      await db.query(
        "select * from recruitment_update_candidates where source_id=$1",
        [f.source],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select * from company_source_snapshots where source_id=$1",
        [f.source],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select application_deadline from recruitment_templates where id=$1",
        [f.t],
      )
    ).rows[0],
  ).toEqual({ application_deadline: null });
});
it("50-company source seed is idempotent and preserves stored URLs", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/seed.sql", "utf8")
      .replace(/^begin;\r?$/m, "")
      .replace(/^commit;\r?$/m, ""),
  );
  await db.exec(readFileSync("supabase/seed-recruitment-sources.sql", "utf8"));
  await db.exec(readFileSync("supabase/seed-recruitment-sources.sql", "utf8"));
  expect(
    (
      await db.query<{ n: number }>(
        "select count(distinct company_id)::int n from company_sources where owner_user_id is null and company_id in(select id from companies where seed_key is not null)",
      )
    ).rows[0].n,
  ).toBe(50);
});

it("transfers private monitored URLs, candidates and settings without losing duplicate-URL history", async () => {
  const f = await monitorFixture(true);
  await db.query(
    "insert into company_source_settings(user_id,source_id,monitor_priority) values($1,$2,'high')",
    [A, f.source],
  );
  const code = (
    await db.query<{ code: string }>("select issue_transfer_code() code")
  ).rows[0].code;
  await as(B);
  const other = (
    await db.query<{ id: string }>(
      "select add_company_source($1,'https://example.com/jobs','recruitment') id",
      [f.company],
    )
  ).rows[0].id;
  await db.query("select redeem_transfer_code($1)", [code]);
  expect(
    (
      await db.query(
        "select * from recruitment_update_candidates where id=$1",
        [f.candidate],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select source_id from recruitment_update_candidates where id=$1",
        [f.candidate],
      )
    ).rows[0],
  ).toEqual({ source_id: other });
  await as(A);
  expect(
    (
      await db.query(
        "select * from recruitment_update_candidates where id=$1",
        [f.candidate],
      )
    ).rows,
  ).toHaveLength(0);
});
it("copying an approved public flow preserves its precise dates", async () => {
  const f = await monitorFixture();
  await db.query(
    "select review_recruitment_candidate($1,array['selection_steps'],'public',null,false,false)",
    [f.candidate],
  );
  await as(B);
  const app = (
    await db.query<{ id: string }>("select copy_template($1) id", [f.t])
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select deadline_value from selection_steps where user_application_id=$1",
        [app],
      )
    ).rows[0],
  ).toEqual({ deadline_value: "2026-10-10" });
});
