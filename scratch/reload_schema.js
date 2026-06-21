import pg from "pg";

const { Client } = pg;
const dbPassword = "A1n2a3l4u5@";
const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.oafpmziavabckhyrkrms.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({ connectionString });
  
  try {
    console.log("Connecting to Supabase PostgreSQL database to reload schema cache...");
    await client.connect();
    
    // Send the reload schema notification
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Success! Schema cache reload notification sent to PostgREST.");
  } catch (err) {
    console.error("Failed to notify PostgREST schema reload:", err.message);
  } finally {
    await client.end();
  }
}

run();
