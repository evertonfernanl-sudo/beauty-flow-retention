const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let envContent = '';
try {
  envContent = fs.readFileSync('.env', 'utf8');
} catch (e) {
  console.error("Could not read .env file", e.message);
}

const parseEnv = (content, key) => {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, 'm'));
  return match ? match[1] : '';
};

const supabaseUrl = parseEnv(envContent, 'SUPABASE_URL');
const supabaseKey = parseEnv(envContent, 'SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function run() {
  try {
    console.log("Connecting to:", supabaseUrl);
    
    // Fetch last 10 imports
    const { data, error } = await supabase
      .from('imports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) {
      throw error;
    }
    
    console.log("Recent imports:");
    data.forEach(imp => {
      console.log(`- ID: ${imp.id}, Source: ${imp.source}, Status: ${imp.status}, Filename: ${imp.filename}, Path: ${imp.storage_path}, Created: ${imp.created_at}`);
    });
  } catch (err) {
    console.error("Error connecting to Supabase:", err.message);
  }
}

run();
