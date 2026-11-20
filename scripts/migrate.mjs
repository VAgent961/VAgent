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
  "ALTER TABLE vagent_departments ADD COLUMN IF NOT EXISTS lead_key text",
  "ALTER TABLE vagent_departments ADD COLUMN IF NOT EXISTS last_talk timestamptz",
  "ALTER TABLE vagent_owners ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner'",
  "ALTER TABLE vagent_owners ADD COLUMN IF NOT EXISTS access_dept int REFERENCES vagent_departments(id) ON DELETE SET NULL",
  "ALTER TABLE vagent_owners ADD COLUMN IF NOT EXISTS access_depts text NOT NULL DEFAULT ''",
  "CREATE TABLE IF NOT EXISTS vagent_wf_cache (inst_id int PRIMARY KEY REFERENCES vagent_n8n(id) ON DELETE CASCADE, summary jsonb NOT NULL, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_departments (id serial PRIMARY KEY, name text NOT NULL, color text NOT NULL DEFAULT '#8FC79D', created_by text, created_at timestamptz DEFAULT now())",
  "ALTER TABLE vagent_departments ADD COLUMN IF NOT EXISTS mission text",
  "CREATE TABLE IF NOT EXISTS vagent_teams (id serial PRIMARY KEY, dept_id int NOT NULL REFERENCES vagent_departments(id) ON DELETE CASCADE, name text NOT NULL, created_at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_agent_meta (key text PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE SET NULL, nickname text)",
  "ALTER TABLE vagent_agent_meta ADD COLUMN IF NOT EXISTS team_id int REFERENCES vagent_teams(id) ON DELETE SET NULL",
  "CREATE TABLE IF NOT EXISTS vagent_hooks (key text PRIMARY KEY, status text NOT NULL, note text, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS vagent_tasks (id serial PRIMARY KEY, dept_id int REFERENCES vagent_departments(id) ON DELETE CASCADE, text text NOT NULL, status text NOT NULL DEFAULT 'running', results jsonb DEFAULT '[]', final text, created_by text, created_at timestamptz DEFAULT now(), done_at timestamptz)",
  "CREATE TABLE IF NOT EXISTS vagent_daily (id bigserial PRIMARY KEY, title text, text text NOT NULL, source text, at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS businesses (id text PRIMARY KEY, name text NOT NULL, profile_context text NOT NULL DEFAULT '', created_at timestamptz DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS voice_orders (id bigserial PRIMARY KEY, business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, customer_details text, order_summary text, at timestamptz DEFAULT now())",
  "ALTER TABLE voice_orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order'",
  "CREATE TABLE IF NOT EXISTS voice_rate (k text NOT NULL, bucket bigint NOT NULL, n int NOT NULL DEFAULT 0, PRIMARY KEY (k, bucket))",
  // ---- Voice AI SaaS (multi-tenant): every row below belongs to exactly one business_id; client APIs derive it from the signed session, never from the request.
  "CREATE TABLE IF NOT EXISTS client_accounts (id serial PRIMARY KEY, business_id text NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE, business_name text NOT NULL, slug text NOT NULL UNIQUE, custom_subdomain text UNIQUE, email text NOT NULL UNIQUE, phone text, password_hash text NOT NULL, password_encrypted text NOT NULL, subscription_start timestamptz NOT NULL DEFAULT now(), subscription_end timestamptz NOT NULL DEFAULT now() + interval '30 days', status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled')), created_at timestamptz NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS items (id bigserial PRIMARY KEY, business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, name text NOT NULL, price numeric(12,2) NOT NULL DEFAULT 0, quantity integer NOT NULL DEFAULT 0, available boolean NOT NULL DEFAULT true, custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS items_business_idx ON items (business_id)",
  "CREATE TABLE IF NOT EXISTS orders (id bigserial PRIMARY KEY, business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, customer_name text, customer_phone text, delivery_address text, items_summary text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','canceled')), created_at timestamptz NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS orders_business_idx ON orders (business_id, created_at DESC)",
  "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true",
  "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS orders_seen_at timestamptz NOT NULL DEFAULT now()",
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
