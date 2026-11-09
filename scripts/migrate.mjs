// Creates/updates all tables (safe to run again). usage: DATABASE_URL=... node scripts/migrate.mjs
const url = process.env.DATABASE_URL;
if (!url) { console.error('need DATABASE_URL'); process.exit(1); }
const api = new URL(url.replace(/^postgres(ql)?:/, 'https:')).hostname.replace(/^[^.]+\./, 'api.');
const sql = async (query, params = []) => {
  const r = await fetch('https://' + api + '/sql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url }, body: JSON.stringify({ query, params }) });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 300));
  return (await r.json()).rows;
};
const steps = [
  "CREATE TABLE IF NOT EXISTS vagent_n8n (id serial PRIMARY KEY, label text NOT NULL, base_url text NOT NULL UNIQUE, api_key_enc text NOT NULL, owner_email text, created_at timestamptz DEFAULT now())",
  "ALTER TABLE vagent_n8n ADD COLUMN IF NOT EXISTS cred_id text",
  "ALTER TABLE vagent_owners ADD COLUMN IF NOT EXISTS last_seen timestamptz",
  "CREATE TABLE IF NOT EXISTS vagent_wf_cache (inst_id int PRIMARY KEY REFERENCES vagent_n8n(id) ON DELETE CASCADE, summary jsonb NOT NULL, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_departments (id serial PRIMARY KEY, name text NOT NULL, color text NOT NULL DEFAULT '#8FC79D', created_by text, created_at timestamptz DEFAULT now())",
  "ALTER TABLE vagent_departments ADD COLUMN IF NOT EXISTS mission text",
  "CREATE TABLE IF NOT EXISTS vagent_teams (id serial PRIMARY KEY, dept_id int NOT NULL REFERENCES vagent_departments(id) ON DELETE CASCADE, name text NOT NULL, created_at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_agent_meta (key text PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE SET NULL, nickname text)",
  "ALTER TABLE vagent_agent_meta ADD COLUMN IF NOT EXISTS team_id int REFERENCES vagent_teams(id) ON DELETE SET NULL",
  "CREATE TABLE IF NOT EXISTS vagent_hooks (key text PRIMARY KEY, status text NOT NULL, note text, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_tasks (id serial PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE CASCADE, text text NOT NULL, status text NOT NULL DEFAULT 'running', results jsonb DEFAULT '[]', final text, created_by text, created_at timestamptz DEFAULT now(), done_at timestamptz)",
];
for (const s of steps) await sql(s);
// Seed a professional org chart once (only when there are no departments yet).
const [{ n }] = await sql('SELECT count(*)::int AS n FROM vagent_departments');
if (!n) {
  const org = [
    ['Sales & Growth', '#E7B38F', 'Find new clients and close deals.', ['Lead Hunting', 'Outreach']],
    ['Marketing', '#E59A7A', 'Make VAgent known: content, social media, ads.', ['Content', 'Social Media']],
    ['Engineering', '#A8B8E8', 'Build websites, AI agents and automations.', ['Websites', 'Automations']],
    ['Operations', '#8FC79D', 'Keep everything running: monitoring, reports, alerts.', ['Monitoring', 'Reporting']],
    ['Customer Success', '#9FD0D6', 'Support and onboard clients.', ['Support', 'Onboarding']],
    ['Quality & Security', '#C8A8E0', 'Test everything and keep it safe.', ['Testing', 'Security']],
  ];
  for (const [name, color, mission, teams] of org) {
    const [d] = await sql('INSERT INTO vagent_departments (name, color, mission, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [name, color, mission, 'setup']);
    for (const t of teams) await sql('INSERT INTO vagent_teams (dept_id, name) VALUES ($1, $2)', [d.id, t]);
  }
  console.log('seeded', org.length, 'departments');
}
console.log('migrated', steps.length, 'steps');
