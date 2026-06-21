import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oafpmziavabckhyrkrms.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnBtemlhdmFiY2toeXJrcm1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAxOTIzNiwiZXhwIjoyMDk3NTk1MjM2fQ.UYW0ljgunub0iqOgl4KR5tuPMXPYTIbriM0oEnXlZEE";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Checking companies on oafpmziavabckhyrkrms...");
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name");

  if (error) {
    console.error("Error fetching companies:", error.message);
  } else {
    console.log("Companies in database oafpmziavabckhyrkrms:");
    console.log(JSON.stringify(companies, null, 2));
  }
}

run();
