# Feature request log

A running list of every feature request for this project, newest session first.
Append each new request here as it comes in (see the rule in CLAUDE.md). Format:
`- [status] request — short note`. Status: ✅ done+verified · 🟡 done, needs live
check · ⏳ in progress · 📦 asset staged, not wired · ❌ deferred.

## Session 2026-10-25 (v2: a new planet, hand-drawn, discovery-based)

- 🟡 **"Now her chin is missing."** Done in v2: the turtleneck rode up over her whole lower face, so the face ended in a flat line. Her face's bottom edge is now a rounded chin just under the mouth, and the collar's front is turned down beneath it (the back of the collar is unchanged). Checked front / three-quarter / side / from below, in the harness and in-game; story run clean.

- 🟡 **"It's still there (flat band under the beret) and her chin is messed up."** Done in v2, checked by toggling each geometry step on/off in a side-by-side harness, picking the exact pixels, and close-ups from ten angles incl. from below; story run clean.
  - The band under the brim was bare SKULL: the model's "face" piece is the whole skull, so its top and back were painted skin. Only its front is face now; behind the cheeks and up under the brim is hair.
  - Chin: the collar's outer rim is at ≈2.95 but its inner lining sits at ≈2.80, and the chin stopped at 2.90 — so you looked down into the dark lining between them. Last round's levelling also bent the jaw. Now only the chin's open bottom edge is extended down to ≈2.78, inside the collar, so the inside of the turtleneck reads as neck; nothing visible moves.

- 🟡 **"You sliced off part of her head (the rest isn't bad); the straps sit too high off her shoulders."** Done in v2, checked with close-ups from six angles round the head and the shoulders; story run clean.
  - The flat cut under the beret was my "tuck" step pushing hair inside a straight-sided cylinder; removed (the hair is still kept inside the felt by the ray clamp, which follows the beret's curve).
  - The straps were tracing the turtleneck collar (|x| < 0.12, up to y 0.235), so they looped over her neck. They're now a fixed shape laid on her measured body: just outside the collar, snug over the shoulder, down the chest to the buckles.

- 🟡 **"The chin and hair are miscoloured; the hat is perfect colour-wise but a little wide for her head."** Done in v2, checked by picking the exact pixels in close-ups (front, back, both sides) and a full story run.
  - Chin: the face WAS skin — the default 3-band cel ramp's mid band darkened her lower face (lit from above) to exactly the hair's tan. Her skin, hair and sweater now use a gentler ramp (and lighter hatching), so the face reads as one skin tone and the hair loses its dark blotches. The chin's zigzag lower edge (collar lining showing between teeth) is levelled and tucked just inside the collar.
  - The dark blot on her back hair was the backpack strap poking out between the locks; the strap now runs from the pack straight over the shoulder.
  - Beret: narrower (brim radius 0.9 → 0.8, a slimmer roll), a touch rounder.

- 🟡 **"What is this extra lump under the beret? Her eyes, face and hair are not properly coloured." + "there is some overlap here still"** Done in v2, checked with flat-colour part maps, raycasts and close-ups from six angles; full story play-through clean.
  - Cause: critic.glb assigns its materials wrongly — the SKIN material covers the face, both eyes, every lock of hair on the front of the head and the sweater cuffs; HAIR is only the back half; SWEATER has the nape hair; JEANS has the hands. So her eyes and front hair rendered skin-coloured.
  - Now recoloured by connected piece of the mesh: face = skin, the two eye pieces = dark eyes (plus a white catchlight each), all other head pieces = hair, cuffs = sweater, hands = skin below the cuff. Hair locks are drawn double-sided (seen from behind they rendered as solid black outline).
  - The beret: the model's own has a zigzag lower edge with hair showing between the teeth, a notch on one side, and its turned-up fold built from scraps of the face/hair meshes (that was the lump). She now wears a new modelled beret (felt dome, rounded hem, slight slouch, stalk) on the head bone; the old beret and its fold scraps are removed, and hair is clamped under the felt so nothing pokes through. (Undid last round's rolled-edge band and partial repaints.)

- 🟡 **"The sleeve isn't fully coloured; the backpack straps don't cover her from the front; the hat isn't fully coloured on one side."** Done in v2, checked with close-up renders from six angles and raycasts on the problem pixels.
  - Sleeves: her hands (in the jeans mesh) reach up inside the cuff and the wrists poked out past the sleeve; everything above the hem is now sweater grey, so the sleeve runs unbroken to the hand.
  - Straps: traced over her real shoulders (measured off the sweater in the pack's frame) — up the back, over the shoulder, down the chest to brass buckles; visible from the front.
  - Beret: the model's beret is notched on one side (its rim rides ~0.15 higher), and her scalp and hair showed through/out of it — that was the pale patch. The rim is now levelled, the beret a touch wider and double-sided, hair/scalp at or above the rim is painted felt and tucked under the brim, the bare scalp at her temple reads as hair, and a rolled felt edge runs round the brim.

- 🟡 **"Fix the colouring on her face and hands; she looks like she's walking backwards."** Done in v2, checked by renders and by measuring the gait.
  - Colour: critic.glb's skin is #f9efe5 (near paper-white), so her face and hands read blank white; now a warm light skin tone (#efc3a2), matched on the repainted hands. The skin mesh also held the sweater's cuffs, which rendered skin-coloured from elbow to wrist; those are now painted the sweater's grey, so only the face and hands are skin.
  - Walk: the knee folded on the leg's BACK-swing, so the lifted foot was the one going backward and the planted foot slid forward (a moonwalk). Measured on her rig: planted foot moved forward in ~70% of frames before, backward in ~75% after. Same fix for the townsfolk walk.

- 🟡 **"Finish the storytelling, and add the cell phone in too for fun — like a little backpack."** Done in v2, verified by a full headless play-through (title → case → accusation → getaway → countdown → abort → epilogue → free roam) with no console errors.
  - The story now has an ending. Name Rex with two proofs → Act 2: his van tears out of town, a cargo launch leaves Cape Far Side at nine, dusk falls. Cape Far Side is a real place now (pad, red lattice gantry, fuel tanks, floodlights, sign, a long road round the planet) with a cream-and-red cargo rocket, Rex's van and three CATERING crates. Rex gloats, bolts up the gantry ("Toodle-oo!"); a 60-second countdown starts, the rocket rumbles and smokes; if it hits zero it's too heavy — it hops, sinks back ("Come ON!") and retries. Hit ABORT on the console; the police roll up with lights; a letterboxed epilogue opens the crates on Janelle's real paintings, finds Rex on the gantry, and ends on the museum at dawn; an end card, then free roam where the project buildings open their real links.
  - The backpack: a little mustard pack with a red flap, brass clasp, front pocket, shoulder straps and the phone peeking out of a side pocket, riding the critic's spine. B opens it: phone, notebook, car keys (finds the car), press pass, and the cargo ticket once you find it.
  - The phone (P): Messages (the editor's texts drive the story; Vivi; Mum, who worries), a hand-drawn Map (roads, coast, places, you, your car; tap a place to follow it; far-off places listed at the bottom), a Camera that takes polaroids of what you're looking at, Photos, and Case. Texts arrive as a little card in the corner.

- 🟡 **"Road paths are slightly broken in some areas, like to the right of the museum; in the museum, show more ornate frames for the ones that got stolen; at the top of the glass by the ladder, show a rope and broken glass."** Done, verified by headless renders; the original game still loads clean (museum.js is shared).
  - Roads: each ribbon is now draped across its width too (one height per cross-section tilted it on the museum's levelled slope, so grass bit through one edge and the other floated) and sits on the highest ground near each vertex.
  - Frames: a carved, gilded frame (cushion moulding, raised lip, pearl bead, shell-and-boss corners, scrolls) on the forecourt easel, plus two more empty ones leaned behind it; the stolen paintings on the exhibition banners sit in painted gilt frames.
  - The dome: the pane is smashed — jagged teeth of glass inked round the hole, hairline cracks into the next panes; a grappling hook caught on the rib above it; a thick knotted rope down the dome, across the roof, over the east wing's parapet to the top of the ladder; shards on both roofs.
- 🟡 **"Keep the car on the road so it's easier to drive; if you hit a person they fly away, land on the ground screaming (oooohhh!) or something fun."** Done in v2, verified headlessly (no off-road samples under full-lock steering; full knock-over cycles).
  - The car is held on the road: it slides along the kerb instead of leaving it, and eases into line with the road when you're not steering (never more than ~50°, so junction turns are yours). It parks at the kerb by the plaza. Lamps and people no longer stop it.
  - Hit someone: they launch flailing with a WAAAH!, tumble, bounce once, land flat on their back with a sung, falling "oooOOOHHH…" (Web Audio), lie there, get up with a grumble ("My INSURANCE!", "Oi! Mind the paintwork!"…) and walk back to their spot. The story's people always come home; you can't talk to anyone mid-air.
  - New townsfolk out walking Main Street (`crowd.js`): Mabel (retired teacher), Sam (student with a café coffee), Dot (dress + beanie) — each their own person per AGENTS.md, looping the pavements and crossing the road.

- 🟡 **"Make the gameplay clearer; the car doesn't show up at first; the camera controls could be better."** Done in v2, verified by headless play-throughs (start → Vivi → suspects → clues → notebook → verdict, plus driving); deploy with `./deploy.sh`.
  - Case board (top left) replaces the one-line goal: 1 · find Vivi → 2 · question Otto, Pia, Rex (with where each one is) + "look around" with finds counted per place (museum, Main Street, harbour, station — never what they mean) → 3 · name the thief → case closed. Click any line to follow it.
  - Waypoint: a sketched arrow pins your current lead (or sits on the screen edge pointing the way) with the distance; it follows the next lead on its own.
  - "Make your case" is now a button in the notebook too (it used to hide on Vivi's last line).
  - The car: the parked roadster was a clone of the hidden in-car body, so it was invisible until you'd driven once — now it's there from the start, parked beside the plaza in view, and on the board ("your car — E to drive").
  - Camera: scroll / pinch to zoom, C swings behind you, it drifts round behind you while you walk (not only straight ahead), cuts cleanly when you get in or out. Fixed a bug where a blocked camera collapsed onto your head and rose straight up (the "staring into the cockpit" view near buildings).
  - Controls strip always on screen (changes in the car), H hides it.

- 🟡 **"Station: the curvature of the terrain + the building is not right, there's a gap" + "that building is ugly — town buildings as good as the museum; a small strip mall and a Main Street with a cute coffee shop, library…"** Done in v2 code, verified by headless screenshots + a floor/road audit; deploy with `./deploy.sh` (no Netlify login in the cloud session). `HANDOFF.md` was asked for but isn't in the repo or on any remote branch.
  - Gap fixed at the root: a flat 9-unit slab on a radius-40 planet lifts ~0.3 at its ends. New `v2/js/buildings.js` sets buildings down with `placeOnPlanet()`, which bakes them, splits long faces and **bends every vertex onto the planet's curve**, so platforms, pavements and lots touch the ground end to end.
  - Central Station rebuilt: brick booking hall with quoins and tall arched windows, a clock tower (stopped at 3:07) with a copper cap and weather vane, slate hipped roofs, a platform under a fretted-valance canopy on iron columns, benches, the CENTRAL sign, track with sleepers and buffer stops, a ramp at each end.
  - Main Street (town frame y = 0, from the museum): 13 modelled shops on two facing terraces (the minor streets that cut them are gone) — Dog-Eared Books, Rise & Shine Bakery, Bean There Café (the café tables + Pia + her bike now sit under its awning), The Bijou cinema (bulb marquee, BIJOU blade), Petal & Stem, Stitch & Thread, Green Grocer, the Public Library (columns, pediment, cupola), Two Scoops, Sharp's Barbers, Tinker's Toys, FRAME & CO. (the van's shop), the Post Office. Pilasters, consoles, fascias, stallrisers, framed sash/arched/bay windows, bracketed cornices, mansards with dormers, Dutch and pointed gables, striped scalloped awnings, blade signs with sculpted emblems, hand-painted window displays, pavements, kerb lamps, bunting.
  - Maple Plaza strip mall past the boulevard (reserved ground): Suds Laundry, Slice of Heaven, Holey Donuts (giant donut), Rewind Video under a covered walk, towers at the ends, a striped lot with planted islands and a pylon sign.
  - The blocks behind Main Street are dressed too (`townBlock`: quoins, floor bands, bracketed cornice all round, parapet, water tank or spire).
  - Cost: Main Street is batched per material; scene ≈ 2.2k draws / 670k tris (was 1.8k / 477k).
  - Merged with main's level-plane museum: buildings now follow the real terrain (not just the sphere), the museum plaza keeps the old street clearance so Main Street still reaches it, and verge trees stay off Main Street. Pushed to `main`.

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
- 🟡 **Shoes look flat/unrealistic; arms stuck to the sides; fix the main character's walk (legs/arms splayed sideways instead of front-to-back).**
  - Shoes are now drawn from a side silhouette (heel counter, collar, instep, round toe) on a separate sole, toe wider than heel, ~15% of body height; trouser hems end inside the collar.
  - Arms hang away from the body (more over coats, dresses and bellies), hands just ahead of the hips.
  - Main character walk: fixed in v2 earlier (model-axis poses); now ported to the ORIGINAL game's `procWalk` in planet.js too (`criticBindFrames` + model-axis turns), cache token p98.
- 🟡 **Shoes curve up at the ankle (should be an S from the side); fix the hands; put everyone's arms in natural positions, doing something in the environment.**
  - Shoes: S-shaped side profile (collar dips at the ankle, tongue, vamp dip, toe box) on a sole with toe spring.
  - Hands: palm + four fingers that curl round what they hold + a thumb.
  - Stances: Vivi holds a clipboard and taps a pen; Otto has his thumb in his belt and a torch on the ground; Pia sips a café coffee, hand on hip; Rex stands arms-crossed in a waist apron. The free hand gestures when they talk. Rules added to AGENTS.md.
- 🟡 **Arms and hands still messed up (Otto's arm inside his body).** A belly now pushes forward instead of widening the torso; each body solves its own arm-hang angle from its waist width so arms clear the body; stance `out` is relative to that; hands are 1.3× (about face length); Otto rests his hand on his belt at the hip. Checked with hand close-ups.
- 🟡 **Shoulders could blend more smoothly into the body.** Limbs fade their ink stroke to nothing where they grow out of the body (per-vertex `inkW` on skinned hulls), so no seam line rings the shoulder; a broader torso shoulder line; sleeves end in a crisp hem with a tiny lip instead of a blurry colour fade; the courier's vest has a clean top edge.
- 🟡 **Her feet sink into the floor; better head shapes (fix the side profile — they're circles); what is the lady in red doing (writing → hold pen + board properly, look down); her movement only happens when I move; the back of the museum is in the street; plants float beside the museum, building looks slanted; no emojis — painted faces.**
  - Feet: people stand on the road ribbons too (`standAt` = ground/floor + road lift).
  - Heads: a sculpted head (`headShape`): skull swells back and tucks in at the nape, flatter face with brow ridge and eye sockets, forehead slopes back, jaw narrows to a chin with a corner below the ear, neck joins behind the jaw; hair and features sit on the surface.
  - Vivi writes: board held at the waist tilted to her face, left hand under it, pen hand solved by two-bone IK onto the page, writing lines; head bowed; pauses to look up; stops and looks at you when you talk. Coat lapel bar → buttons; Rex's apron tie no longer a hoop.
  - Idle life is visible on its own (writing loop, wider torch sweep), not only when you move.
  - Museum: ground under it levelled to a true tangent PLANE (curved-planet edges were ~0.6 low → floating planters, slanted look); landmarks crowding it moved (Inbox Zero, YarnFlow, DeckGPT, The Council); roads re-deflected after smoothing. Zone + road audits clean.
  - No emojis: painted portraits rendered from each person's own model (toon + ink, gouache wash, pencil ring); clue cards show painted sketches of the actual props.
  - Conversations get a side-on two-shot camera framing you and them.
- 🟡 **Did you fix the head shapes and side profiles?** Not fully — true side-on renders showed a flat face, a tiny ball nose and the neck rising from the middle of the skull. Now: a real nose (extruded side silhouette: bridge, tip, turn under; narrow at the bridge, nostril wings), fuller mouth area and a chin in the profile, the neck leans forward and joins the back of the skull, Pia's ponytail hangs down with a tie. Verified with exact side + front renders of all four.
- 🟡 **Vary the people; better noses, smiles and hair.** New `faces.js`: per-person head shape (jaw, chin, cheeks, face length, skull, brow); nose types drawn from side silhouettes (button, straight, Roman, snub); expressions as tapered brush strokes on the face (worried, tired, open grin with teeth, smirk) with matching brows, lids (sleepy / narrowed), lashes and eye highlights; hair and beards grown from the scalp inside a real hairline (arc over the forehead, temples, sideburns, centre/side partings, volume on top) with smooth edges; a twisted bun, a tapered curly ponytail. Vivi anxious, Otto sleepy, Pia cheerful, Rex smug.
- 🟡 **Necks look forced on; make the hair texture cooler.** Necks are a lathe that flares into the shoulders and tucks under the jaw, outline faded at both ends (non-skinned `inkW` ink), and every outfit has a collar (stand-up coat collar, gold-edged uniform collar, crew necks). Hair and beards get combed strands cut into the geometry, flowing toward the bun/ponytail/crown (or down, for a beard), a cool sheen streak across the strands, and darker roots at the hairline (vertex colours).
- 🟡 **Hats sit on their heads weirdly; make Pia's ponytail flowy at the bottom.** Hats are built from each wearer's own head shape: Otto's peaked cap has a band fitted to his measured head width/depth, a wider crown and a sloped visor; Rex's tweed flat cap hugs the skull with a flat top sloping to the front and a tucked brim; Pia's helmet is a shell over the skull with smooth vents, a dark rim and chin straps. Pia's ponytail is five tapered locks gathered at the tie that splay and flick at the ends, with sheen, swaying as she moves. Merged the other session's town work (buildings, Main Street, Maple Plaza, new Central Station) first.
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
- 🟡 Main character walk animation swings out-to-in instead of front-to-back (procWalk) — fixed 2026-10-25: turns are written in model axes and converted per bone.
- 📦 Replace the bicycle with `yellow_bicycle.glb` and delete the old asset — asset processed; wiring the rigged player vehicle needs a verified pass.
- ✅ Limo not pulling up to the gas station (stops mid-road) — increased forecourt pull-in to ~2.0 so it sits at the pumps.
- 🟡 Cabin→window transition should feel like a head-turn (yaw in place, level), not a flashcard swipe — rewrote as a gaze yaw about the up axis.
- 🟡 Cabin window: turn LEFT not right (seat POV); texture the wall + rim to match the cabin interior; show a city skyline + water outside that scrolls right→left like the plane is cruising over it — done (cabin-wall canvas on the ring, warm tan rim, tiling dusk-skyline canvas scrolled behind the porthole).
- 🟡 Car shading too dark ("angry scratches") — the per-mesh boil hulls scratch on decimated car geometry; cars/limo now skip the hull (keep flat fills + inked edges).
- 🟡 Tyres flying off the cars — removed the tyre-spin (wheels share the car origin, so spinning flung them); wheels stay put now.
- ⏳ **City layout redesign** (foundational): current block layout is a mess. Make it TWO city halves split by a water channel; the boat sails the channel between them; the train runs through both; roads grade smoothly downtown→rural with no random dead-ending spurs. Ref: dense two-sided city split by a river (tutorial: youtube n0i9RHMypfo). We'll fill in specific buildings over time — this is just the layout.
- ✅ Downtown "all blocks to each other, hard to move through" — parcels now greedy-packed biggest-first with a guaranteed 1.4-unit clear street between every footprint (foundation included); fewer, bigger towers, real walkable gaps.
- ✅ **Intro cinematic totally changed** — now an 11s letterboxed cut with the HUD + label sprites hidden: jet touches down (trackside) → limo rolls up to the hotel → phone buzzes → texts. Old 36s cabin/airstair/gas-stop version retired.
