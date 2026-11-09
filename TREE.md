# TREE — the whole project on one page (keep it updated, one line per item)

## Files
- `index.html` — sign-in page (one screen, no scroll). Posts to /api/login.
- `office.html` — office app: top bar (task, settings), left sidebar (filters, search, agent list, activity), office stage. Needs session.
- `assets/office.css` — office styles (layout, drawers, mobile).
- `assets/scene.js` — static isometric SVG, floor 1300x900: 24 desks, 16 café spots, 6 lead rooms, VScene.vb = default view. No logic.
- `assets/nozoom.js` — blocks browser zoom everywhere (both pages); only the office scene zooms (handled in office.js).
- `assets/office.js` — app logic: polling /api/office, placing agents, GSAP walking, zoom/pan of the scene (viewBox), drawers (agent, department, settings, tasks), 3-step "Connect your n8n" wizard (openConnect), owner filter, "/" search, failure toasts.
- `functions/_lib.js` — sql() over Neon HTTPS, password check, signed session cookie, AES-GCM encrypt/decrypt, json().
- `functions/_n8n.js` — n8n helpers: instances(), call(), workflow summaries (cached in DB 2 min), classify status.
- `functions/_middleware.js` — guards /office and /api/* (sets `data.owner`); signed-in users skip sign-in page.
- `functions/api/login.js` · `logout.js` — sign in/out.
- `functions/api/me.js` — GET current owner.
- `functions/api/n8n.js` — GET list / POST connect {url (with or without https), key, label?} with friendly errors / DELETE ?id= (n8n instances).
- `functions/api/office.js` — GET everything the office needs: agents, departments, activity, instance errors.
- `functions/api/agent.js` — GET ?key= details (runs, steps) / POST {key, action: run|activate|deactivate|assign|rename, message?, deptId?, name?}.
- `functions/api/departments.js` — GET / POST {name,color} / DELETE ?id=.
- `functions/api/tasks.js` — GET ?deptId= / POST {deptId,text}: runs the department's webhook agents, combines one result.
- `scripts/migrate.mjs` — creates/updates all DB tables. `scripts/create-owners.mjs` — add/reset owners.
- `_headers` — no-cache for html/assets so updates show at once.
- `scripts/deploy.sh` — upload site + functions to Cloudflare Pages project `vagent`.

## Agent key + status
- Agent key = `<instanceId>:<workflowId>`.
- Status: `working` (running execution) → desk · `idle` (active) → café · `off` (inactive) → café, asleep · `help` (last run failed <24h) → red mark.
- Calls to agent webhooks carry header `X-VAgent-Secret` (secret WEBHOOK_SECRET); protect webhooks in n8n with Header Auth "VAgent office secret".
- Office Helper (n8n workflow ESroHEmOT74IkcBr on hassan.vagent.online): POST /webhook/office-helper → AI Helper → {output}. Example agent for chat + tasks.
- Runnable = has a Webhook trigger with a static path (production URL `<base>/webhook/<path>`). Chat + tasks use it.

## DB tables (Neon)
- `vagent_owners`, `vagent_login_fails` — auth.
- `vagent_n8n` (id, label, base_url, api_key_enc, owner_email) — connected n8n instances.
- `vagent_wf_cache` (inst_id, summary jsonb, at) — compact workflow list cache.
- `vagent_agent_meta` (key, dept_id, nickname) — department assignment.
- `vagent_departments` (id, name, color, created_by) · `vagent_tasks` (id, dept_id, text, status, results, final, created_by, times).

## Commands (run in repo root)
- Migrate: `DATABASE_URL="$(cat ~/agent-tools/.neon-vagent-url)" node scripts/migrate.mjs`
- Deploy: `./scripts/deploy.sh` → https://vagent.online (Pages project `vagent` in Fayez's Cloudflare account 602f300b…, also vagent-bef.pages.dev). Token: ~/agent-tools/.cf-vagent-token (Pages edit + DNS edit on vagent.online).
- DNS (zone in Fayez's account): vagent.online + www → Pages. hassan./fayez./boudy.vagent.online → server tunnel (never touch).
- Domain/secrets setup: `node ~/agent-tools/vagent-cf.js project|domains`
- Responsive check: `node ~/agent-tools/site-checker/resp-test.js index.html`
- Old secrets script (Hassan account, unused): `node ~/agent-tools/cf-pages-secrets.js vagent` (DATABASE_URL, SESSION_SECRET, ENC_KEY, WEBHOOK_SECRET; values kept in ~/agent-tools/.vagent-*)
- API test: `~/agent-tools/vagent-api.sh office | head -c 600` (signs in as hassan)
- Visual test: `node ~/agent-tools/site-checker/office-shot.js` → /tmp/office-desktop.png, /tmp/office-phone.png
