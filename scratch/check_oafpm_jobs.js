import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oafpmziavabckhyrkrms.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnBtemlhdmFiY2toeXJrcm1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAxOTIzNiwiZXhwIjoyMDk3NTk1MjM2fQ.UYW0ljgunub0iqOgl4KR5tuPMXPYTIbriM0oEnXlZEE";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Checking imports on oafpmziavabckhyrkrms...");
  const { data: imports, error: impErr } = await supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (impErr) {
    console.error("Error fetching imports:", impErr.message);
  } else {
    console.log("Recent imports:", JSON.stringify(imports, null, 2));
  }

  console.log("Checking jobs on oafpmziavabckhyrkrms...");
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (jobsErr) {
    console.error("Error fetching jobs:", jobsErr.message);
  } else {
    console.log("Recent jobs:", JSON.stringify(jobs, null, 2));
  }
}

run();
