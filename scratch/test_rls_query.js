import pg from "pg";

const { Client } = pg;
const dbPassword = "A1n2a3l4u5@";
const ref = "oafpmziavabckhyrkrms";

async function run() {
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to PostgreSQL successfully!");
    
    // Switch to anon role
    await client.query("SET ROLE anon;");
    console.log("Switched session role to 'anon'.");
    
    // Try querying the view
    const res = await client.query("SELECT * FROM public.v_public_busy_slots LIMIT 5;");
    console.log("Query v_public_busy_slots Success! Rows count:", res.rows.length);

    // Try querying appointments directly
    try {
      const resAppts = await client.query("SELECT * FROM public.appointments LIMIT 5;");
      console.log("Query public.appointments Success! Rows count:", resAppts.rows.length);
    } catch (err) {
      console.log("Query public.appointments failed as expected:", err.message);
    }

  } catch (err) {
    console.error("Test Failed:", err.message);
  } finally {
    await client.end();
  }
}

run();
