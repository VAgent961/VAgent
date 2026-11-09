// Creates/updates all tables. usage: DATABASE_URL=... node scripts/migrate.mjs
const url = process.env.DATABASE_URL;
if (!url) { console.error('need DATABASE_URL'); process.exit(1); }
const api = new URL(url.replace(/^postgres(ql)?:/, 'https:')).hostname.replace(/^[^.]+\./, 'api.');
const sql = async (query) => {
  const r = await fetch('https://' + api + '/sql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url }, body: JSON.stringify({ query, params: [] }) });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 300));
};
const steps = [
  "CREATE TABLE IF NOT EXISTS vagent_n8n (id serial PRIMARY KEY, label text NOT NULL, base_url text NOT NULL UNIQUE, api_key_enc text NOT NULL, owner_email text, created_at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_wf_cache (inst_id int PRIMARY KEY REFERENCES vagent_n8n(id) ON DELETE CASCADE, summary jsonb NOT NULL, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_departments (id serial PRIMARY KEY, name text NOT NULL, color text NOT NULL DEFAULT '#8FC79D', created_by text, created_at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_agent_meta (key text PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE SET NULL, nickname text)",
  "CREATE TABLE IF NOT EXISTS vagent_tasks (id serial PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE CASCADE, text text NOT NULL, status text NOT NULL DEFAULT 'running', results jsonb DEFAULT '[]', final text, created_by text, created_at timestamptz DEFAULT now(), done_at timestamptz)",
];
for (const s of steps) await sql(s);
console.log('migrated', steps.length, 'steps');
