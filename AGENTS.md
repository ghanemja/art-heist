# Agent rules for this repo

Project overview, the art style and the workflow rules live in [`CLAUDE.md`](CLAUDE.md).
This file holds the standing rules for specific kinds of work.

## Making people models (v2: `v2/js/folk.js`)

People are the thing players look at most closely, so they get held to a higher bar
than props. Every new person — townsfolk, crowd, a one-off character — must follow these:

1. **Never a clone of the main character.** The critic (`models/critic.glb`) is the
   player only. Recolouring her rig is not a new person. Build townspeople with
   `makeFolk(spec)` (or a new model of their own) with their own build, face, hair and outfit.
2. **Same scale as the critic.** ≈1.2 units tall, about four heads high; hips ≈0.565,
   shoulders ≈0.86 above the soles. Vary with `height` (±5%) and `build`, never by
   scaling the whole figure up. Check side-by-side with the critic before shipping.
3. **Feet on the ground, always.** Every person has shoes (a rounded upper + a sole)
   that sit exactly on the floor: place people with `settle(..., sink = 0)`, never the
   prop sink. Raised floors (forecourt, platforms) must be registered with `addFloor`.
   Shoes contrast with the trousers so the feet read.
4. **Smooth joints — no hinges.** Each arm and leg is ONE skinned tube (`limb()`)
   whose weights blend across the knee/elbow, so bends curve. Never build limbs from
   separate stacked segments; never leave a visible seam or step at a joint.
   Profiles go through `smooth()` (Catmull-Rom) so silhouettes are round, not faceted.
5. **Shoulders grow out of the torso.** The torso's profile slopes from the neck into
   the shoulder; the arm joint sits *inside* that curve so the top of the arm forms
   the deltoid. No bolt-on shoulder balls or pads.
6. **Real hands.** A mitten hand: a flattened palm facing the thigh, a curl for the
   fingers, a thumb forward — skin-coloured, sized to the wrist (≈0.03). Never a plain ball.
7. **A face.** Eyes, brows, nose, mouth (and cheeks) — small and soft. Face details
   are `noInk` (drawn, not outlined); the head itself is inked.
8. **Alive, not posed.** Idle breathing, weight shift and glances (`poseFolk`), turn to
   face the player when near, gesture while talking. Poses rotate the joint groups/bones
   in their own frame: +Z is forward, a negative X rotation swings a hanging limb forward.
9. **Fits the style + the budget.** Toon `paint()` materials, inked with `ink(root, 'fine')`
   (skinned limbs get skinned ink automatically). Keep a person under ~6k tris.
10. **Verify up close before calling it done.** Screenshot every new person from the
    front and at a low angle (feet, hands, shoulders, face) in the headless browser,
    next to the critic, and look at the result.
