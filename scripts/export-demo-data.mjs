// Exports your workspace data for the offline demo build.
//
//   npm run demo:export
//
// Signs in to Supabase as you (email + password typed here, never stored or
// printed) and saves everything the workspace shows to demo/demo-data.json.
// The file contains confidential case and loan data: it is git-ignored, and
// anyone who receives the built demo can read all of it.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";

function readEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(file, "utf8");
      const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
      const url = get("VITE_SUPABASE_URL");
      const key = get("VITE_SUPABASE_PUBLISHABLE_KEY") || get("VITE_SUPABASE_ANON_KEY");
      if (url && key) return { url, key };
    } catch {}
  }
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not found in .env.local or .env");
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

async function all(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const { url, key } = readEnv();
const supabase = createClient(url, key, { auth: { persistSession: false } });
const email = await ask("Work email: ");
const password = await ask("Password: ", { hidden: true });
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) { console.error(`Sign-in failed: ${authError.message}`); process.exit(1); }

const { data: workspaces, error: wsError } = await supabase.from("workspaces").select("id,name,created_at").order("created_at");
if (wsError) throw wsError;
console.log(`Signed in as ${auth.user.email}. Exporting ${workspaces.length} workspace(s)…`);

const data = { exportedAt: new Date().toISOString(), user: { email: auth.user.email, name: auth.user.user_metadata?.full_name || "" }, workspaces, tables: {} };
const tables = {
  court_cases: "*",
  case_listings: "*",
  court_search_captures: "id,workspace_id,captured_at,received_at,search_context,total_establishments,reported_cases,court_totals,loaded_rows,skipped_rows",
  case_audit: "*",
  listing_audit: "*",
  case_captures: "id,case_id,workspace_id,captured_by,captured_at,received_at,outcome,source_url,snapshot",
};
for (const [table, columns] of Object.entries(tables)) {
  data.tables[table] = [];
  for (const ws of workspaces) {
    const rows = await all(() => supabase.from(table).select(columns).eq("workspace_id", ws.id).order("id"));
    data.tables[table].push(...rows);
  }
  console.log(`  ${table}: ${data.tables[table].length} rows`);
}
await supabase.auth.signOut();

mkdirSync("demo", { recursive: true });
const json = JSON.stringify(data);
writeFileSync("demo/demo-data.json", json);
console.log(`Saved demo/demo-data.json (${(json.length / 1024 / 1024).toFixed(1)} MB). Now run: npm run demo:build`);
