import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value;
  }
});

const supabase = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
);

async function run() {
  const { data: roles, error: err1 } = await supabase
    .from('user_roles')
    .select('user_id, role, company_id, permissions');
  if (err1) {
    console.error('Error fetching user_roles:', err1);
  } else {
    console.log('--- USER ROLES ---');
    console.log(roles);
  }

  const { data: profiles, error: err2 } = await supabase
    .from('profiles')
    .select('id, name, email, company_id');
  if (err2) {
    console.error('Error fetching profiles:', err2);
  } else {
    console.log('--- PROFILES ---');
    console.log(profiles);
  }
}

run();
