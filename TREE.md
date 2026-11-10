# TREE — the whole project on one page (keep it updated, one line per item)

## Files
- `index.html` — sign-in page (one screen, no scroll). Posts to /api/login.
- `office.html` — office app: top bar (task, settings), left sidebar (filters, search, agent list, activity), office stage. Needs session.
- `assets/office.css` — office styles (layout, drawers, mobile).
- `assets/scene.js` — GENERATED building: `VScene.build(departments)` → one room per department (no limit; odd count adds a "+ Add a department" spot). Column count is chosen so the finished floorplan is as close to square as possible — a room is 1040 wide by 2600 deep, so a square *grid* would still be a tall strip; build() scores every column count by |log(W/D)| and takes the best (9 depts → 5×2, 30 → 9×4), each 35 desks (7x5) + a 35-spot lounge (gaming/TV, sofas, reading nook, bean bags+music, snack bar). Right column: CEO office, café (16 spots), open desks (no department). Returns {inner, vb, desks, deskRoom, rooms[{lead, desks, rest, box}], hot, cafe, cafeIdx, spotProp, ceo}. Characters are built by the `char()` generator at the top of scene.js (one function, five outfits): #bot, #bot-lead, #lead, #ceo, #msgbot — shaded faces, eyes, hair, glasses, collar/tie, ID badge, watch, sneakers; tie/badge/pocket square take the department colour via currentColor; iris keeps class `eye`. office.js rebuilds the SVG when the department list changes; resting agents get a prop (book/pad/phone/mug/music/rest). Test with fake data: ~/agent-tools/site-checker/rooms-shot.js (ROOMS=n).
- `assets/nozoom.js` — blocks browser zoom everywhere (both pages); only the office scene zooms (handled in office.js).
- `assets/office.js` — app logic: polling /api/office, placing agents, GSAP walking, zoom/pan of the scene (viewBox), drawers (agent, department, settings, tasks), 3-step "Connect your n8n" wizard (openConnect), owner filter, "/" search, failure toasts.
- `functions/_lib.js` — sql() over Neon HTTPS, password check, signed session cookie, AES-GCM encrypt/decrypt, json().
- `functions/_n8n.js` — n8n helpers: instances(), call(), workflow summaries (cached in DB 2 min), classify status.
- `functions/_middleware.js` — guards /office and /api/* (sets `data.owner`); signed-in users skip sign-in page.
- `functions/api/login.js` · `logout.js` — sign in/out.
- `functions/api/me.js` — GET current owner.
- `functions/api/n8n.js` — GET list / POST connect {url (with or without https), key, label?} with friendly errors / DELETE ?id= (n8n instances).
- `functions/api/office.js` — GET everything the office needs: agents, departments, activity, instance errors.
- `functions/api/agent.js` — GET ?key= details (runs, steps) / POST {key, action: run|activate|deactivate|assign|rename, message?, deptId?, name?}. `assign` also takes `keys: []` (max 200, one INSERT) so a department drawer can move many agents at once — see its "Move agents into …" picker in office.js.
- `functions/_brain.js` — think(): calls n8n "VAgent Brain" (Groq first, Gemini backup) via BRAIN_URL + X-VAgent-Secret; parseJSON/plain helpers.
- `functions/_office.js` — officeData() (whole company) + companyText() (short text for AI prompts). Used by office.js, talk.js, act.js.
- `functions/api/talk.js` — POST {to: ceo | lead:<id> | agent:<key>, message, history}: AI personas. CEO returns {reply, actions[], prompt (Claude prompt)}. Agents with their own webhook get the message directly.
- `functions/api/act.js` — POST {actions[]}: runs CEO actions after the owner approves (departments, teams, move/rename/run/turn on/off agents).
- `functions/api/departments.js` — GET / POST {name,color} / DELETE ?id=.
- `functions/api/tasks.js` — GET ?deptId= / POST {deptId,text}: department = project team. Lead plans (1 AI call) to use as many startable members as possible, runs them in parallel (webhook gets {task, project}; run-now members just start), combines one final result (1 AI call).
- Lead chat (talk.js) returns {reply, project}: a project brief the owner starts with the "Start with the team" button.
- `scripts/migrate.mjs` — creates/updates all DB tables. `scripts/create-owners.mjs` — add/reset owners.
- `_headers` — no-cache for html/assets so updates show at once.
- `scripts/deploy.sh` — upload site + functions to Cloudflare Pages project `vagent`.

## Agent key + status
- Agent key = `<instanceId>:<workflowId>`.
- A department's lead never sits: it stands at the room's lead spot (`leaddesk`) whether working or idle, while the team takes desks.
- Chats are kept in localStorage per target (`vagent-ceo`, `vagent-chat-<to>`, last 30 messages), so closing the drawer or the tab keeps the thread. A sent message also saves a `pending` bubble that is replaced in place when the reply lands, so reopening mid-answer still shows it working; a pending older than 3 minutes (tab was reloaded, request lost) renders as "that answer never came back".
- Talking to a department's lead (its drawer, or `lead:<id>`) stamps `vagent_departments.last_talk`; for the next 15 minutes every active `idle` employee in that department is reported as `working`, so the team sits at its desks and then drifts back to the lounge. Set in `api/talk.js`, applied in `_office.js`. `off` and `help` are left alone.
- Status: `working` → a desk in its department room (no department / room full → open desks); `idle` → its department lounge (no department / lounge full → café). Building is dark themed. · `idle` (active) → café · `off` (inactive) → café, asleep · `help` (last run failed <24h) → red mark.
- Calls to agent webhooks carry header `X-VAgent-Secret` (secret WEBHOOK_SECRET); protect webhooks in n8n with Header Auth "VAgent office secret".
- Office Helper (n8n workflow ESroHEmOT74IkcBr on hassan.vagent.online): POST /webhook/office-helper → AI Helper → {output}. Example agent for chat + tasks.
- Auto run-now hooks: on import, workflows with schedule/manual triggers get a "VAgent: run now" webhook (path vagent-run-<id>, header auth) via ensureHooks() in _n8n.js. Other triggers are never modified.
- n8n "VAgent Brain (office AI)" n9gGqB09jODqaESZ on hassan.vagent.online: POST /webhook/vagent-brain {system,prompt} → {ok,text}.
- Runnable = has a Webhook trigger with a static path (production URL `<base>/webhook/<path>`). Chat + tasks use it.
- Sniper Client department chain (all on hassan.vagent.online): lead **Sniper Client Chat** bM8cGfGz9offcGsF (district → business type → top 3 → pick one) calls **Sniper Hunt** G0Wd90XEjWm07fEk (Maps + Instagram + score + one Groq call for all 3 problem/solution briefs), then on a pick calls **Sniper Profile** gTolasT0Ibog3cQ2 (Maps detail + Instagram handle/bio + Google Images logo & photos) and **The Messenger** 4SMj0E05y8FAMEdC (works out what they need, pulls a WhatsApp number out of the Instagram bio when Maps has none, and outputs a ready-to-send message plus a `brief` JSON).
- **Website build handoff (built, waiting on the builder).** The Messenger posts `{brief}` to Office Helper `/webhook/office-helper` (Header Auth cred uH92VMtELZYJTo4r "VAgent office secret"). Office Helper's "Is it a build job?" branch saves a row in Postgres `web_builds` (job_id, business, brief, status, link, error), POSTs `{job_id, callback_url, brief}` to Abdallah's PM Tech on `https://boudy.vagent.online/webhook/pm-tech-build`, and answers `{ok, job_id, status}` — `builder_unreachable` while his endpoint is missing, so nothing hangs. He posts the finished link to **Web Build Callback** YIWkQ0l4O2uqw5yo `/webhook/pm-tech-done` `{job_id, status, link|error}`. The lead's `build: <job_id>` route reads `web_builds` and shows the link, behind a "Check the website" button. Change the builder URL in Office Helper's "Start Build" node (BUILDER const).
- **Connecting a website builder:** VAgent is not building its own — Fayez's builder plugs in here. In The Messenger, add one executeWorkflow node after "Decide Need" that takes `{{ JSON.stringify($json.brief) }}` and returns a link, then have "Hand Over" print that link instead of the handover block. `brief` already carries business, type, city, address, phone (+source), instagram, bio, logo, photos, rating, reviews, current_website, wants.
- AI inside chat agents must NOT call "AI Helper" JbEPqVrYDdPPOiPm: it tries Gemini 6× at 150s each then a 15-min local model, far past the 55s chat timeout. Call Groq directly (httpRequest, predefinedCredentialType `groqApi` C884CaXhJSy97IGU, model openai/gpt-oss-120b, timeout 25s, neverError).
- n8n here does NOT register webhook paths containing `:params` (a `p/:slug` path 404s even when active). Use a static path + query string. Preview pages are therefore served at `/webhook/p?s=<slug>`.
- Tap-button agents: a webhook agent may answer `{reply, buttons:[{label,value}]}`. runWebhook passes `buttons` through, talk.js returns them, office.js paints them as chips under the reply; a tap sends `value` as the next message. Agents are stateless — put the state in `value` (e.g. `district: Chouf` → `Chouf | Gyms`). Runnable agents also get a ▶ Start chip when their drawer opens. Example: Sniper Client Chat (bM8cGfGz9offcGsF) district → business type → top 3 leads.

## DB tables (Neon)
- `vagent_owners`, `vagent_login_fails` — auth.
- `vagent_n8n` (id, label, base_url, api_key_enc, owner_email) — connected n8n instances.
- `vagent_wf_cache` (inst_id, summary jsonb, at) — compact workflow list cache.
- `vagent_agent_meta` (key, dept_id, team_id, nickname) — department assignment.
- `vagent_departments` (id, name, color, mission, created_by) · `vagent_teams` (id, dept_id, name) · `vagent_hooks` (key, status, note): run-now hooks added
- seeded org: Sales & Growth, Marketing, Engineering, Operations, Customer Success, Quality & Security (2 teams each)
- `vagent_departments` (old line) · `vagent_tasks` (id, dept_id, text, status, results, final, created_by, times).

## Commands (run in repo root)
- Migrate: `DATABASE_URL="$(cat ~/agent-tools/.neon-vagent-url)" node scripts/migrate.mjs`
- Deploy: `./scripts/deploy.sh` → https://vagent.online (Pages project `vagent` in Fayez's Cloudflare account 602f300b…, also vagent-bef.pages.dev). Token: ~/agent-tools/.cf-vagent-token (Pages edit + DNS edit on vagent.online).
- DNS (zone in Fayez's account): vagent.online + www → Pages. hassan./fayez./boudy.vagent.online → server tunnel (never touch).
- Domain/secrets setup: `node ~/agent-tools/vagent-cf.js project|domains`
- Responsive check: `node ~/agent-tools/site-checker/resp-test.js index.html`
- Old secrets script (Hassan account, unused): `node ~/agent-tools/cf-pages-secrets.js vagent` (DATABASE_URL, SESSION_SECRET, ENC_KEY, WEBHOOK_SECRET; values kept in ~/agent-tools/.vagent-*)
- API test: `~/agent-tools/vagent-api.sh office | head -c 600` (signs in as hassan)
- Visual test: `node ~/agent-tools/site-checker/office-shot.js` → /tmp/office-desktop.png, /tmp/office-phone.png
