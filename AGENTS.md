# Agent rules for this repo

Project overview, the art style and the workflow rules live in [`CLAUDE.md`](CLAUDE.md).
This file holds the standing rules for specific kinds of work.

## Making people models (`js/folk.js`)

People are the thing players look at most closely, so they get held to a higher bar
than props. Every new person — townsfolk, crowd, a one-off character — must follow these:

1. **Never a clone of the main character.** The critic (`models/critic.glb`) is the
   player only. Recolouring her rig is not a new person. Build townspeople with
   `makeFolk(spec)` (or a new model of their own) with their own build, face, hair and outfit.
2. **Same scale as the critic — and the town.** The Citizen Maker bystanders
   (`citizens.js`, ≈1.03–1.21 tall) set the scale: the critic is ≈1.12 units tall
   (`HUMAN_SCALE` 0.12), folk bodies are sized by `FOLK_SCALE` (≈1.12 at `height` 1, about
   four heads high; hips ≈0.5, shoulders ≈0.76 above the soles). Vary with `height` (±5%)
   and `build`, never by scaling the whole figure up. Check side-by-side with the critic and a
   bystander before shipping (measure the skinned extent along up, not the bind pose).
3. **Feet on the ground, always.** Every person has shoes (a rounded upper + a sole)
   that sit exactly on the floor: place people with `settle(..., sink = 0)`, never the
   prop sink. Raised floors (forecourt, platforms) must be registered with `addFloor`.
   Shoes contrast with the trousers so the feet read.
4. **Smooth joints — no hinges.** Each arm and leg is ONE skinned tube (`limb()`)
   whose weights blend across the knee/elbow, so bends curve. Never build limbs from
   separate stacked segments; never leave a visible seam or step at a joint.
   Profiles go through `smooth()` (Catmull-Rom) so silhouettes are round, not faceted.
5. **Arms clear the body.** A belly pushes forward, never out to the sides where the
   arms hang; each body solves its arm-hang angle from its own waist width (`armOut`).
   Stance `out` values are relative to that, so a broad person's arms don't sink in.
   Close-up check: no part of an arm or hand may be inside the torso.
5b. **Shoulders grow out of the torso.** The torso's profile slopes from the neck into
   the shoulder; the arm joint sits *inside* that curve so the top of the arm forms
   the deltoid. No bolt-on shoulder balls or pads. Limbs fade their outline out where
   they join the body (`inkW` via `limb(..., { inkFrom, inkTo })`) so no seam line is
   drawn round the shoulder or hip. Sleeves end in a crisp hem (`hem:`), never a colour smear.
6. **Real hands.** A palm facing the thigh, four three-jointed fingers that curl to grip
   (`gripHand`), a two-jointed thumb forward — one skinned mesh, skin-coloured, sized to the
   wrist (≈0.03, the wrist flattened into the palm). Never a ball or a blob. Held things sit
   at the fist centre (`FIST`) with the handle across the palm, so the fingers wrap it.
7. **A head, not a ball — and a face.** Heads use `headShape` (skull back, nape tucked in,
   flat face with brow ridge and eye sockets, jaw narrowing to a chin, neck behind the
   jaw). Check the SIDE PROFILE. Features and hair are placed on that surface (`headPt`,
   `shapedSphere`). Eyes, brows, nose, mouth, cheeks are small, soft and `noInk`.
7a. **Every face is different, and has a personality.** Build heads with `buildHead`
   (faces.js) and give each person their own `face`: shape (jaw/chin/cheeks/long/skull/
   brow), nose type, mouth expression, eyes, brows, hair style, beard. Cast the face to
   the character (anxious, sleepy, cheerful, smug). Hair grows from the scalp inside a
   hairline mask with a smooth edge — never a cap or a ball stuck on the head. Hair has
   texture: combed strands flowing toward where it's gathered, a sheen streak, darker roots.
7d. **Hats are made from the head they sit on** (`sculpt` the wearer's head shape, or fit a
   band to its measured width/depth). Never a generic shape dropped on top.
7c. **Necks grow out of the body.** A neck flares into the shoulders and tucks under the
   jaw, its outline fades at both ends (`inkW`), and it rises out of a collar.
7b. **No emoji, anywhere in the UI.** People's faces are painted portraits rendered
   from their own model (`portraits.js`); clues are painted sketches of the real prop.
8. **Doing something, not just standing.** Every person gets a `stance` (`STANCES` in
   folk.js) that fits where they are and who they are — the director holds a clipboard
   and pen, the guard a torch with his thumb in his belt, the courier a café coffee with a
   hand on her hip, the suspect stands arms-crossed. Arms never just dangle at random.
   Props go in the hand (`hold`), the fingers grip them, and the stance has a small
   loop of life (a sip, writing, a torch sweep) that plays on its own, visibly — not only
   when the player moves. The hand that talks is the free one. Precise hand work (writing)
   uses `ikArm` so the hand lands exactly on the target, and the head looks at the task.
9. **Shoes have an S profile.** From the side the topline dips at the ankle, rises over
   the tongue, dips across the vamp and swells over the toe; the sole springs up at the toe.
10. **Alive, not posed.** Idle breathing, weight shift and glances (`poseFolk`), turn to
   face the player when near, gesture while talking. Poses rotate the joint groups/bones
   in their own frame: +Z is forward, a negative X rotation swings a hanging limb forward.
11. **Fits the style + the budget.** Toon `paint()` materials, inked with `ink(root, 'fine')`
   (skinned limbs get skinned ink automatically). Keep a person under ~6k tris.
12. **Verify up close before calling it done.** Screenshot every new person from the
    front and at a low angle (feet, hands, shoulders, face) in the headless browser,
    next to the critic, and look at the result.
