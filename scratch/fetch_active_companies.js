import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hkeyxtrnuxucxvxvgubg.supabase.co";
const anonKey = "sb_publishable_O6biqa9CXj8DrWwpvBUDrQ_Wmg5dLNV";

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, active, onboarding_completed");
  
  if (error) {
    console.error("Error fetching companies:", error.message);
  } else {
    console.log("Companies visible to anon:", data);
  }
}

run();
