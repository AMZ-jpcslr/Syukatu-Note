import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("upgrades a populated v1 database without changing identities or losing legacy records", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`create schema auth; create schema extensions; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ["202609220001_initial.sql", "202609220002_csv.sql"])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app = "11111111-1111-4111-8111-111111111111";
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into anonymous_users(id) values($1)", [user]);
    await db.query(
      "insert into user_applications(id,user_id,company_name,graduation_year,selection_type,priority,memo,application_deadline) values($1,$2,'legacy',2028,'本選考','S','keep memo','2028-11-01')",
      [app, user],
    );
    await db.query(
      "insert into selection_steps(user_id,user_application_id,title,step_type,deadline,completed,result) values($1,$2,'legacy step','ES締切','2028-10-01',true,'keep result')",
      [user, app],
    );
    await db.query(
      "insert into es_questions(user_id,user_application_id,question,answer) values($1,$2,'legacy ES','keep answer')",
      [user, app],
    );
    await db.query(
      "insert into interview_notes(user_id,user_application_id,scheduled_at,stage,format,questions,answers) values($1,$2,now(),'一次面接','オンライン','keep question','keep interview answer')",
      [user, app],
    );
    const before = (
      await db.query<Record<string, unknown>>("select * from user_applications")
    ).rows[0];
    await db.exec(
      readFileSync("supabase/migrations/202609220003_v11.sql", "utf8"),
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from user_applications",
        )
      ).rows[0],
    ).toMatchObject(before);
    expect((await db.query("select id from anonymous_users")).rows[0]).toEqual({
      id: user,
    });
    expect((await db.query("select answer from es_questions")).rows[0]).toEqual(
      { answer: "keep answer" },
    );
    expect(
      (await db.query("select answers from interview_notes")).rows[0],
    ).toEqual({ answers: "keep interview answer" });
    expect(
      (await db.query("select state,result from selection_steps")).rows[0],
    ).toEqual({ state: "完了", result: "keep result" });
    expect((await db.query("select * from tasks")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);
