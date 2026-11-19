# V Agent City — real agent movement between buildings and floors

## Status (what is real and what is not)
Implemented (behind `office.html?city=1`, tested in the browser): `assets/vmove.js` — the world graph, persistent agent state and journeys.
- **Sonic really travels:** Sniper floor -> exit gate -> street (crosswalks) -> Marketing HQ -> escalators up -> floor 3 -> escalators down -> lobby -> street -> Web Builder -> the lead's desk -> and back home. His speed, trails, acceleration and braking are the original ones on every floor; on the street the same blue trail is redrawn.
- **Escalators:** a real prop in the original scene (`VScene.build(depts, look, { esc })`: ramps, floor opening, portals, nav footprint) on every Marketing HQ floor. Agents walk to the boarding pad (A*), ride (one rider per 1.2 s per ramp) and step off at the arrival pad of the next floor.
- **Persistence:** every travelling agent keeps its location + route in `VMove` while floors/buildings are opened and closed; no duplicate elements, no lost journeys. Unseen floors/streets are simulated with the same routes and speeds.
- **Real triggers only:** Sonic's build errands (`D.builds`), and an agent whose department really changes (it walks from its old floor to its new one). `VMove.go/goHome/adopt/release` work for any agent.
- Original interiors: `scene.js` output is byte-identical without the escalator option; `office.js` only has opt-in CITY hooks.

Not implemented / honest limits:
- **The escalator ride is split across two scenes.** The engine shows one floor at a time, so the departure floor shows the rise (phase A, 3.0 s) and the arrival floor shows the agent emerging (phase B, 1.2 s). There is no single continuous shot of a rider crossing floors.
- Positions are in memory only (a page reload returns everyone to the original placement).
- An agent whose floor was never on screen starts its trip at its department's entrance (the original code does not track unseen floors).
- Agent-to-agent collision exists only as the original door queue + the escalator spacing; two agents on the street can overlap.
- Other work (lead tasks, manual moves) does not move agents between buildings yet.

## Design (as built)
1. **World model — `assets/vmove.js`**: reference floors per building kind (`VMove.ref`, one `VScene.build` each, same nav on every floor), `VMove.plan(from,to)` -> legs `walk | ride | door` (walks use `VNav.route`: floors use the scene nav, the street uses `VCity.nav` with crosswalk gaps).
2. **Persistent agent state**: `VMove.st.loc[key] = {lv:'floor'|'street', b, f, x, y}` + `VMove.st.jr[key]` (route, current leg). One clock advances all of them; a visible floor lets the original `goTo()/step()` walk, an unseen one is simulated.
3. **Handover with the original scene**: `VMove.sync()` spawns/removes the agent element when the view changes (hooks in `office.js`: spawn, take, release, despawn, walk, put, posOf). Managed agents are excluded from the original placement (`g._managed`), so there is never a duplicate. `goHome` walks to the department entrance and hands the agent back to `sceneRender`.
4. **Escalators** — `scene.js escalator()`; portals in `S.esc` (board west end, arrive east end of each lane).
5. **Street** — `city.js` builds the street nav and draws the figures (`VCity.streetDraw`).
6. **Recovery** — a scene walk whose element vanished is respawned (visible) or continued in simulation (unseen); a walk far overdue is re-planned; after 3 failed re-plans the agent is placed at the leg target and the event is logged (`VMove.st.stats`).


## Unified world update
The city is now a single world: opening a floor mounts the original office inside the building (see TREE.md). Escalator/agent-travel limits above are unchanged: an agent only physically moves between buildings via VMove, one floor is simulated live at a time.

## Escalators — verified state and remaining work (final pass)
Verified in Playwright: an agent sent from Marketing floor 1 to floor 3 walks to the boarding pad on floor 1 (visible), rides (leaves the scene), passes floor 2 (simulated, not on screen), arrives on floor 3 at the exact target (44,116), exactly one element, no duplicates. Sonic Sniper floor -> street -> Web Builder floor arrives at the exact lead spot (verified 55 s).
Remaining for a continuous, visible ride: (1) the office scene is one svg with fixed ids, so only ONE floor can be drawn live; a second scene instance (id-namespaced defs/layers) per visible floor is needed to show the rider on the escalator between two open floors; (2) a cutaway that shows two adjacent floors at once; (3) persistence across reload. The floor bar's Up/Down only moves the cutaway; it does not carry agents (labels no longer say "escalator").
