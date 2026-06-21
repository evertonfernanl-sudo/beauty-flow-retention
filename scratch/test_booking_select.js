import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hkeyxtrnuxucxvxvgubg.supabase.co";
const anonKey = "sb_publishable_O6biqa9CXj8DrWwpvBUDrQ_Wmg5dLNV";

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  console.log("Querying v_public_busy_slots as anon...");
  const { data, error } = await supabase
    .from("v_public_busy_slots")
    .select("*")
    .limit(10);

  if (error) {
    console.error("Error querying view as anon:", error.message);
  } else {
    console.log("Success querying view as anon!");
    console.log("Data length:", data.length);
    console.log("Data sample:", data);
  }
  
  console.log("\nQuerying appointments as anon directly...");
  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("id, start_datetime")
    .limit(5);
    
  if (apptErr) {
    console.error("Error querying appointments as anon:", apptErr.message);
  } else {
    console.log("Success querying appointments as anon!");
    console.log("Appointments length:", appts.length);
  }
}

run();
