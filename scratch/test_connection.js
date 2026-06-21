import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

const pubKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const secKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL:", env.SUPABASE_URL);
console.log("Publishable key (first 10 chars):", pubKey ? pubKey.slice(0, 15) : "missing");
console.log("Secret key (first 10 chars):", secKey ? secKey.slice(0, 15) : "missing");

async function test() {
  if (pubKey) {
    const clientPub = createClient(env.SUPABASE_URL, pubKey);
    const { data, error } = await clientPub.from("companies").select("id").limit(1);
    console.log("Test with Publishable Key - Error:", error ? error.message : "None", "Data length:", data ? data.length : 0);
  }
  if (secKey) {
    const clientSec = createClient(env.SUPABASE_URL, secKey);
    const { data, error } = await clientSec.from("companies").select("id").limit(1);
    console.log("Test with Secret Key - Error:", error ? error.message : "None", "Data length:", data ? data.length : 0);
  }
}

test();
