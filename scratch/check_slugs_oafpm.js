import pg from "pg";

const { Client } = pg;
const dbPassword = "A1n2a3l4u5@";
const ref = "oafpmziavabckhyrkrms";

async function run() {
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const res = await client.query("SELECT id, name, slug FROM public.companies;");
    console.log("Companies in oafpm after migration:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
