import pg from "pg";

const { Client } = pg;
const dbPassword = "A1n2a3l4u5@";

async function checkDb(ref) {
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  try {
    console.log(`\nConnecting to database: ${ref}...`);
    await client.connect();
    console.log(`Connected to ${ref} successfully!`);
    
    // Check if client_phone2 column exists in import_rows
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'import_rows' AND column_name = 'client_phone2';
    `);
    
    if (res.rows.length > 0) {
      console.log(`[${ref}] column 'client_phone2' EXISTS in import_rows table.`);
    } else {
      console.log(`[${ref}] column 'client_phone2' DOES NOT exist in import_rows table.`);
    }

    // Check if other new tables/columns exist
    const resClients = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'clients' AND column_name = 'phone2';
    `);
    if (resClients.rows.length > 0) {
      console.log(`[${ref}] column 'phone2' EXISTS in clients table.`);
    } else {
      console.log(`[${ref}] column 'phone2' DOES NOT exist in clients table.`);
    }
  } catch (err) {
    console.error(`[${ref}] Database check failed:`, err.message);
  } finally {
    await client.end();
  }
}

async function run() {
  await checkDb("oafpmziavabckhyrkrms");
  await checkDb("hkeyxtrnuxucxvxvgubg");
}

run();
