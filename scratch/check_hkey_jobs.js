import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hkeyxtrnuxucxvxvgubg.supabase.co";
const pubKey = "sb_publishable_O6biqa9CXj8DrWwpvBUDrQ_Wmg5dLNV";

const supabase = createClient(supabaseUrl, pubKey);

async function run() {
  console.log("Checking imports on hkeyxtrnuxucxvxvgubg using Publishable Key...");
  const { data: imports, error: impErr } = await supabase
    .from("imports")
    .select("id, filename, created_at, status")
    .order("created_at", { ascending: false })
    .limit(5);

  if (impErr) {
    console.error("Error fetching imports:", impErr.message);
  } else {
    console.log("Recent imports on hkey:", JSON.stringify(imports, null, 2));
  }
}

run();
