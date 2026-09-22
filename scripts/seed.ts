import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { companies, templates } from "../src/db/schema";
import { demoCompanies, demoTemplates } from "../src/lib/demo";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(client);
try {
  await db.transaction(async (tx) => {
    for (const [i, t] of demoTemplates().entries()) {
      const [company] = await tx
        .insert(companies)
        .values({
          id: t.company_id,
          name: t.company_name,
          industry: demoCompanies[i][1],
        })
        .onConflictDoUpdate({
          target: companies.name,
          set: { name: t.company_name },
        })
        .returning({ id: companies.id });
      await tx
        .insert(templates)
        .values({
          ...t,
          company_id: company.id,
          created_at: new Date(t.created_at),
          last_verified_at: t.last_verified_at
            ? new Date(t.last_verified_at)
            : null,
        })
        .onConflictDoNothing();
    }
  });
  console.log(
    "7 sample templates seeded. Dates intentionally unset; verify real recruitment information.",
  );
} finally {
  await client.end();
}
