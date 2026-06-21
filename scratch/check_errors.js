import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oafpmziavabckhyrkrms.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnBtemlhdmFiY2toeXJrcm1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAxOTIzNiwiZXhwIjoyMDk3NTk1MjM2fQ.UYW0ljgunub0iqOgl4KR5tuPMXPYTIbriM0oEnXlZEE";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Checking import_errors on oafpmziavabckhyrkrms...");
  const { data: errors, error } = await supabase
    .from("import_errors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching import_errors:", error.message);
  } else {
    console.log("Recent errors in database oafpmziavabckhyrkrms:");
    console.log(JSON.stringify(errors, null, 2));
  }
}

run();
