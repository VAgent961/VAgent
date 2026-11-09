# TREE — the whole project on one page (keep it updated, one line per item)

## Files
- `index.html` — sign-in page (one screen, no scroll). Posts to /api/login.
- `office.html` — the office app shell (needs session; middleware redirects to / if not signed in).
- `assets/office.css` — office styles (layout, drawers, mobile).
- `assets/scene.js` — static isometric SVG (floor, walls, café, desks, lead rooms) + seat/desk coordinates. No logic.
- `assets/office.js` — app logic: polling /api/office, placing agents, GSAP walking, drawers (agent, department, settings, tasks).
- `functions/_lib.js` — sql() over Neon HTTPS, password check, signed session cookie, AES-GCM encrypt/decrypt, json().
- `functions/_n8n.js` — n8n helpers: instances(), call(), workflow summaries (cached in DB 2 min), classify status.
- `functions/_middleware.js` — guards /office and /api/* (sets `data.owner`); signed-in users skip sign-in page.
- `functions/api/login.js` · `logout.js` — sign in/out.
- `functions/api/me.js` — GET current owner.
- `functions/api/n8n.js` — GET list / POST connect {label,url,key} / DELETE ?id= (n8n instances).
- `functions/api/office.js` — GET everything the office needs: agents, departments, activity, instance errors.
- `functions/api/agent.js` — GET ?key= details (runs, steps) / POST {key, action: run|activate|deactivate|assign, message?, deptId?}.
- `functions/api/departments.js` — GET / POST {name,color} / DELETE ?id=.
- `functions/api/tasks.js` — GET ?deptId= / POST {deptId,text}: runs the department's webhook agents, combines one result.
- `scripts/migrate.mjs` — creates/updates all DB tables. `scripts/create-owners.mjs` — add/reset owners.
- `scripts/deploy.sh` — upload site + functions to Cloudflare Pages project `vagent`.

## Agent key + status
- Agent key = `<instanceId>:<workflowId>`.
- Status: `working` (running execution) → desk · `idle` (active) → café · `off` (inactive) → café, asleep · `help` (last run failed <24h) → red mark.
- Runnable = has a Webhook trigger with a static path (production URL `<base>/webhook/<path>`). Chat + tasks use it.

## DB tables (Neon)
- `vagent_owners`, `vagent_login_fails` — auth.
- `vagent_n8n` (id, label, base_url, api_key_enc, owner_email) — connected n8n instances.
- `vagent_wf_cache` (inst_id, summary jsonb, at) — compact workflow list cache.
- `vagent_agent_meta` (key, dept_id, nickname) — department assignment.
- `vagent_departments` (id, name, color, created_by) · `vagent_tasks` (id, dept_id, text, status, results, final, created_by, times).

## Commands (run in repo root)
- Migrate: `DATABASE_URL="$(cat ~/agent-tools/.neon-vagent-url)" node scripts/migrate.mjs`
- Deploy: `./scripts/deploy.sh` → https://vagent.pages.dev
- Responsive check: `node ~/agent-tools/site-checker/resp-test.js index.html`
- Secrets: `node ~/agent-tools/cf-pages-secrets.js vagent` (sets DATABASE_URL, SESSION_SECRET, ENC_KEY)
