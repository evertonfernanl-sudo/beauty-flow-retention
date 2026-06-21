import pg from "pg";

const { Client } = pg;
const dbPassword = "A1n2a3l4u5@";
const ref = "hkeyxtrnuxucxvxvgubg";

async function run() {
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected to DB!");
    
    // Check pg_policies for appointments
    const res = await client.query(`
      SELECT policyname, cmd, roles, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'appointments';
    `);
    
    console.log("\nRLS Policies on 'appointments':");
    res.rows.forEach(r => {
      console.log(`- Policy: ${r.policyname}`);
      console.log(`  Roles:  ${r.roles}`);
      console.log(`  Cmd:    ${r.cmd}`);
      console.log(`  Qual:   ${r.qual}`);
    });

  } catch (err) {
    console.error("Failed:", err);
  } finally {
    await client.end();
  }
}

run();
