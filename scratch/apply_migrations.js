import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

// Get arguments
const dbPassword = process.argv[2];
if (!dbPassword) {
  console.error("Please provide the database password: node scratch/apply_migrations.js <password>");
  process.exit(1);
}

const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.oafpmziavabckhyrkrms.supabase.co:5432/postgres`;
const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");

async function run() {
  const client = new Client({ connectionString });
  
  try {
    console.log("Connecting to the new Supabase database...");
    await client.connect();
    console.log("Connected successfully!");

    // Get all SQL files and sort them alphabetically to preserve migration order
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files to apply.`);

    for (const file of files) {
      console.log(`Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      
      try {
        await client.query(sql);
        console.log(`Successfully applied ${file}`);
      } catch (err) {
        console.error(`Error applying migration ${file}:`, err.message);
        console.error("Do you want to continue? (Press Ctrl+C to abort)");
      }
    }

    console.log("\nAll migrations processed!");
  } catch (err) {
    console.error("Database connection/migration failed:", err.message);
  } finally {
    await client.end();
  }
}

run();
