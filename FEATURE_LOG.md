# Feature request log

A running list of every feature request for this project, newest session first.
Append each new request here as it comes in (see the rule in CLAUDE.md). Format:
`- [status] request — short note`. Status: ✅ done+verified · 🟡 done, needs live
check · ⏳ in progress · 📦 asset staged, not wired · ❌ deferred.

## Session 2026-10-25 (v2: a new planet, hand-drawn, discovery-based)

- 🟡 **"Intro broken (no plane), hotel ugly, random sheep + broken tree"** — superseded by v2 (new cold open, no hotel/sheep).
- 🟡 **"Let people discover clues instead of telling them" + "styling not quite right" + "bridge intersects things — make a new planet?"** → v2 in `v2/` (live game untouched until approved). Phase 1 done, verified headless in play:
  - Hand-drawn style: matte toon paint with paper grain + shadow-only pencil hatching, constant-width ink outlines with a slow boil, paper sky, sketchbook UI with hand lettering (bundled fonts). No shine, no chrome, no tone mapping.
  - New planet built on the reservation map from day one: museum + plaza, fitted downtown grid, boulevard ring, spurs, station, harbour, landmarks; nothing built on anything.
  - Cold open (≈10s, skippable): night shots of the museum → the editor's texts → you're on the plaza at dawn.
  - Walk (camera-relative, shift to run) and drive the jeep (E to get in/out); camera swings round buildings instead of clipping into them; jeep nose collides.
  - Discovery case: 8 things to notice (glints, no markers), 4 people to talk to; the notebook only records what you saw; make your case to Vivi with a suspect + two pieces of evidence.
  - Next phases: train, bike, boat, rocket finale (the canvases leave Cape Far Side tonight); airport + launch pad; town life; touch controls; audio.
- 🟡 **v2: people look human, right size; player sinking into the floor; camera feels off; main character's rig broken; start button up a bit.**
  - Everyone is now the same rigged body as the critic, recoloured per person (hair, skin, clothes, hat) — same height as you. They breathe, glance around, turn to face you and gesture while talking.
  - Rig fixed: poses are now written in the model's own axes and converted per bone, so legs/arms swing forward-back (they swung sideways before). Real stride with knee bend, arm counter-swing, a run lean; the critic sits properly at the jeep's wheel.
  - Floors: the museum forecourt and station platform register as walkable floors (`addFloor`/`groundAt`) — no more sinking.
  - Camera: keeps its own facing (no more chasing your turns into a spiral), eases behind you only while you walk forward, chase cam in the jeep, lower and closer.
- 🟡 **Townspeople were clones of the main character → each their own person; fix the car model; apply the critic colour fix from the original game.**
  - `folk.js`: a jointed toon body per person with their own build, face (eyes, brows, nose, blush, mouth), hair and outfit — Vivi (bun, glasses, long burgundy coat), Otto (broad guard in a peaked cap and belted uniform), Pia (courier: helmet, ponytail, hi-vis vest, short sleeves), Rex (framer: beard, flat cap, canvas apron). Same height as the critic; they idle, turn to face you, gesture while talking.
  - Car: a vintage roadster — extruded, deep-bevelled body with real wheel arches, long bonnet, round lamps, grille, chrome bumpers, windshield, seats, whitewall tyres; the critic sits at the wheel.
  - Critic colours: hands repainted skin (they were baked into the jeans mesh) and nape hair repainted hair, on top of the model's own vertex colours.
- 🟡 **People: missing feet, abrupt thigh→calf joints; then fix hands + shoulders; add a people-model rule to AGENTS.md.**
  - Each arm and leg is now one skinned tube whose weights blend across the knee/elbow, so joints curve; profiles are Catmull-Rom smoothed.
  - Shoes with soles that sit on the ground (people are placed with no sink); shoes contrast with trousers.
  - Shoulders slope out of the torso, the arm joint sits inside the curve (no shoulder balls); mitten hands with a palm, finger curl and thumb.
  - New `AGENTS.md` "Making people models" rules, linked from CLAUDE.md.
- ⏳ **Bring back the phone with the map + travel options; finale: someone gives you an address, you use the map and rent a car across the street or borrow Pia's bike.** Next up.
- ⏳ **Travel: all of them** (car, walk, train, bike, boat, rocket) — walk + jeep done in v2; rest in phase 2.

## Session 2026-10-24 (layout rebuild)

- 🟡 **"The world is still messed up and clashing" → layout rebuild (not a restart).** Done in code, verified with a true-scale planning map, the overlap/on-road audits and screenshots in all three modes; deploy with `./deploy.sh`.
  - One reservation map (`ZONES`): landmarks, stations, districts, the mountain reserve ground first; ring loop, boulevard, spurs and railway bend around it; the scenic loop skirts downtown.
  - Downtown rebuilt as a fitted grid: the grown plan put 198 streets on a 2.6 grid → 0.5-unit parcels, so towers stood in the streets. Now 4.2-pitch blocks, one building per block, nothing on a road.
  - Moved: the mall out of the middle of downtown to the boulevard (anchors.mall), Museum Station out of the museum (stops.museumst), the gas station off the airport road, the rocket pad off Far Side Station, Farm B off the jetty; the airport road stops at the apron.
  - Hotel arrival: districts inside the ring get no backwards spur; the limo stops at the boulevard kerb; turning circles lie on the terrain; the jetty only runs over water.
  - Buildings on roads: 40 → only intentional ones (the bridge) + kerb-flush facades. Draw calls ~1200 → ~870.

## Session 2026-10-23 (opening screen, title wording, graphics + lightweight)

- 🟡 **Better opening planet layout + better title wording + graphics polish, and keep it lightweight.** Done in code, verified by headless screenshots (desktop + phone); deploy with `./deploy.sh`.
  - Name: the painted title is now **THE VANISHING GALLERY** (new H/V/G/R brush glyphs), with "45 real paintings, stolen in one night. Get them back." and "an art heist on janelle ghanem's tiny planet" under it; button "start the case". In-game header + browser tab match.
  - Opening layout: planet sits low in frame with its skyline on the horizon, the title paints into the sky above; opens facing downtown/the museum; map labels hidden on the title card; title scales and lifts on phones (it used to clip).
  - Graphics: barbie "chrome" vibe no longer turns the ground and roads into a mirror ball (buildings keep their chrome); sea is soft, not glossy.
  - Lightweight: static batching (merge per material) of decoration, landmark buildings, the station + car models, and every static prop (a motion probe confirms nothing merged ever moves). Draw calls per frame: Classic 2058 → ~1200 (−42%), Wasteland 4452 → ~2000 (−55%). No visual change.

## Session 2026-10-22 (world clean-up: grounding, overlaps, calmer lines)

- 🟡 **"The world is a mess: roads float, the limo is inside a building, the comic lines waver too much."** Fixed in code + verified by headless screenshots; deploy with `./deploy.sh` (cloud session has no Netlify login).
  - Floating: the planet's ground mesh was icosahedron detail 6 (~4.5-unit triangles) while everything else sits on the analytic height — flat triangle middles sagged ~0.08 below roads/buildings. Now detail 44 (~0.7-unit triangles).
  - Limo in the hotel: spur roads ran straight to each district's centre, where the hotel/mall/barn stands. Spurs now stop in front (SPUR_SETBACK); the limo parks in the turning circle; hotel faces its drive; cabanas, palms and beach umbrellas keep off the drive.
  - Overlaps (new `?audit=1` dev report): cottages were on every landmark's plaza/road → moved across the road; downtown towers were built through the Galleria → district clearances; decoration inside any structure is removed; farm silo/farmhouse no longer inside the barn; Gas-N-Go moved off Harvest Fields' farmhouse (t 0.5→0.64); mall cars off the foundation; a tower on the museum forecourt removed.
  - Lines: Wasteland boil 7→4 redraws/s, width jitter ±50%→±20%, sideways wander 1.4×→0.35× thickness, thinner strokes, fainter over-stroke; Sketchbook ink wobble ~3px→~1px at 4fps, steadier paper.

## Session 2026-10-07 (art heist: museum + narrative)

- 🟡 **Art heist overhaul — top-notch museum, less sloppy, fix the narrative.** Done in code, verified by headless screenshots in Classic / Sketchbook / Wasteland; **not yet deployed** (no Netlify CLI/token in the cloud session — run `./deploy.sh` locally).
  - New modelled Downtown Museum (`museum.js`): fluted Greek-revival portico on a 3-tier stylobate, carved inscription, pediment with gilded medallion, balustraded wings with arched windows, ribbed glass rotunda with ONE pane cut out + the thief's rope, ladder on the east wing, police tape, blinking beacons, night searchlights, empty gilded frame on an easel, compass-rose forecourt. Smooth/bevelled throughout; merged per material (~54k tris, few draw calls).
  - Narrative unified into one story ("the vanishing gallery"): phone texts, every NPC is a witness handing over evidence, Director Vivi's line reacts to your progress, Cape Far Side is the getaway shuttle chase, finale = case closed.
  - Fixed dead features: clues could never be collected (`collectClue` was never called) and Cape Far Side never launched (`defStop` dropped `launches`). Clues are now numbered evidence tents; restart clears the case.
  - UI: "skip intro" no longer lingers during play; controls hint no longer hidden under the zoom bar; long landmark labels no longer clip.
  - Dev params: `?at=<landmark>[&atx=&atz=]`, `?shotcam=<landmark>,x,y,z,lookY,lookZ`, `?dlg=<stop>`.

## Session 2026-08-11 (cars, jet, limo, arrival cinematic)

- ✅ Import new car + jet GLBs; cartoon style; physics; cars drive only on road; diverse; light for browser.
- ✅ Use original textures on cars; add bevels (smooth/curved); cars get boil + grease-pencil.
- ✅ Jet gets the same layered boil outline (`_gpForce` bypass for its big meshes).
- ✅ Replace cabin image with a supplied one, then make it crisp/cartoony (not blurry).
- 🟡 Deployable landing gear on the jet (uses `landing_gear.glb`) that deploys on descent.
- 🟡 Airstair that deploys at step-off.
- 🟡 Main character walks out of the plane and into the limo.
- ✅ Replace limo with `limo.glb`; textured + outlines + cartoon effects.
- 🟡 Cars touch the ground (not floating); tyres spin / boil for a sense of motion.
- ✅ Create CLAUDE.md (style, bevels-vs-browser, redeploy-after-each-feature).
- ✅ Keep this running feature-request log; reference it from CLAUDE.md.
- ❌ Main character walk animation swings out-to-in instead of front-to-back (procWalk) — needs live view to fix the bone axis.
- 📦 Replace the bicycle with `yellow_bicycle.glb` and delete the old asset — asset processed; wiring the rigged player vehicle needs a verified pass.
- ✅ Limo not pulling up to the gas station (stops mid-road) — increased forecourt pull-in to ~2.0 so it sits at the pumps.
- 🟡 Cabin→window transition should feel like a head-turn (yaw in place, level), not a flashcard swipe — rewrote as a gaze yaw about the up axis.
- 🟡 Cabin window: turn LEFT not right (seat POV); texture the wall + rim to match the cabin interior; show a city skyline + water outside that scrolls right→left like the plane is cruising over it — done (cabin-wall canvas on the ring, warm tan rim, tiling dusk-skyline canvas scrolled behind the porthole).
- 🟡 Car shading too dark ("angry scratches") — the per-mesh boil hulls scratch on decimated car geometry; cars/limo now skip the hull (keep flat fills + inked edges).
- 🟡 Tyres flying off the cars — removed the tyre-spin (wheels share the car origin, so spinning flung them); wheels stay put now.
- ⏳ **City layout redesign** (foundational): current block layout is a mess. Make it TWO city halves split by a water channel; the boat sails the channel between them; the train runs through both; roads grade smoothly downtown→rural with no random dead-ending spurs. Ref: dense two-sided city split by a river (tutorial: youtube n0i9RHMypfo). We'll fill in specific buildings over time — this is just the layout.
- ✅ Downtown "all blocks to each other, hard to move through" — parcels now greedy-packed biggest-first with a guaranteed 1.4-unit clear street between every footprint (foundation included); fewer, bigger towers, real walkable gaps.
- ✅ **Intro cinematic totally changed** — now an 11s letterboxed cut with the HUD + label sprites hidden: jet touches down (trackside) → limo rolls up to the hotel → phone buzzes → texts. Old 36s cabin/airstair/gas-stop version retired.
