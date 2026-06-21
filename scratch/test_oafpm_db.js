import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oafpmziavabckhyrkrms.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnBtemlhdmFiY2toeXJrcm1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAxOTIzNiwiZXhwIjoyMDk3NTk1MjM2fQ.UYW0ljgunub0iqOgl4KR5tuPMXPYTIbriM0oEnXlZEE";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Connecting to new Supabase project oafpmziavabckhyrkrms...");
  
  // Test query on companies table
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .limit(5);

  if (compErr) {
    console.error("Error fetching companies:", compErr.message);
    console.error("Full error object:", JSON.stringify(compErr, null, 2));
  } else {
    console.log("Success! Companies table exists. Count of rows:", companies.length);
    console.log("Companies:", JSON.stringify(companies, null, 2));
  }

  // Test query on imports table
  const { data: imports, error: impErr } = await supabase
    .from("imports")
    .select("id, status")
    .limit(5);

  if (impErr) {
    console.error("Error fetching imports:", impErr.message);
  } else {
    console.log("Success! Imports table exists. Count of rows:", imports.length);
  }
}

run();
