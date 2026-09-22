import { config } from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required (server-only). Supabase SQL Editor can also run supabase/seed.sql.",
  );
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync("supabase/seed.sql", "utf8"));
  const [count] =
    await sql`select count(*)::int as companies from public.companies where seed_key like 'career-company-%'`;
  if (count.companies !== 50)
    throw new Error("Expected 50 seeded company masters");
  console.log(
    `Seed verified: ${count.companies} companies. Existing recruitment data preserved; unknown dates remain NULL.`,
  );
} finally {
  await sql.end();
}
