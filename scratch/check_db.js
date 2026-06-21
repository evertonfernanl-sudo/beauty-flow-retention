import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Parse .env and .env.local manually
function loadEnv() {
  const env = {};
  const files = [".env", ".env.local"];
  for (const file of files) {
    const filePath = path.resolve(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      content.split("\n").forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || "";
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          env[key] = value.trim();
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Connecting to Supabase...");
  
  // 1) Fetch last 3 imports
  const { data: imports, error: impErr } = await supabase
    .from("imports")
    .select("id, filename, source, status, rows_total, last_error, created_at")
    .order("created_at", { ascending: false })
    .limit(3);
    
  if (impErr) {
    console.error("Error fetching imports:", impErr);
  } else {
    console.log("\n--- RECENT IMPORTS ---");
    console.log(JSON.stringify(imports, null, 2));
  }

  // 2) Fetch last 5 jobs
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, type, status, attempts, last_error, created_at, scheduled_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (jobsErr) {
    console.error("Error fetching jobs:", jobsErr);
  } else {
    console.log("\n--- RECENT JOBS ---");
    console.log(JSON.stringify(jobs, null, 2));
  }
  
  // 3) Fetch recent import errors
  const { data: impErrors, error: impErrorsErr } = await supabase
    .from("import_errors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
    
  if (impErrorsErr) {
    console.error("Error fetching import errors:", impErrorsErr);
  } else {
    console.log("\n--- RECENT IMPORT ERRORS ---");
    console.log(JSON.stringify(impErrors, null, 2));
  }
}

run();
