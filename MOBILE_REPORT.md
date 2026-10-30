# The Vanishing Gallery on a phone: mobile check (2026-10-30)

Method: served the repo locally and drove it with Playwright + Chromium using mobile emulation
(iPhone 13, 390×664, DPR 3; Pixel 7, 412×839, DPR 2.625; `hasTouch`, `isMobile`, portrait **and**
landscape; WebGL through SwiftShader). Every input in the play-through was a real tap or touch-drag.
Long trips (town → Cape Far Side) were teleported to save time, and the last step called
`abortLaunch()` directly: it is the same tap-the-prompt → `act()` path already exercised for
talking, clues and the car. Screenshots are in `screenshots/mobile/`.

## Verdict

- **`main` today: not playable.** Everything except moving can be done by tapping. But the player
  can't walk or drive without a keyboard, so a phone user is stuck on the museum steps.
- **This branch (`mobile-check`): playable start to finish by touch, in emulation.** A touch-only
  run went from title → Vivi → two clues → accuse Rex → get in the car → drive and steer → Rex at
  the Cape → countdown → abort → "Case closed" end card, with no console errors.
- **Still unverified: frame rate on a real phone.** SwiftShader fps tells you nothing. The scene is
  heavy for a mid-range phone (see Performance), so the next step is testing on a real iPhone and
  Android phone.

## What a touch-only player could not do on `main`

| Action | Keyboard | Touch on `main` | On this branch |
|---|---|---|---|
| Walk / run | WASD, Shift | **impossible** | thumb stick; push it all the way to run |
| Drive / steer / brake | W/S/A/D | **impossible** | the same stick: up/down for throttle/brake, left/right to steer |
| Talk / look / get in / get out / abort | E | tap the prompt pill (works) | same; the pill moves above the stick |
| Next line / bye / accuse | E | buttons (work) | same |
| Notebook | N | button (works) | same |
| Backpack, phone | B, P | backpack button → Phone (works) | same |
| Close panels | Esc | close buttons (work) | same |
| Look around / zoom | drag, scroll | one-finger drag, pinch (works) | same |
| Recenter camera | C | none | none (minor) |
| Hide key hints | H | n/a | key hints are hidden on touch |

## Fixes on this branch (each needs the owner's OK before it goes to main)

1. **Thumb stick** (`js/player.js`, CSS in `index.html`). A 128px stick sits bottom-left. It feeds
   analog input into the existing walk and drive code; the keyboard still takes priority. It only
   shows on touch devices (`pointer: coarse` or after the first `touchstart`), and only while
   you're playing with no panel open. It is not the canvas, so the camera drag and pinch keep
   working alongside it with a second finger.
2. **Case board folds by default on small screens** (`js/game.js`). It's the default when the
   screen is under 700px wide or under 500px tall. In portrait the open board covered about 40% of
   the screen; in landscape, half of it. A choice the player saved still wins.
3. **Touch layout** (`index.html`):
   - The keyboard-hint strip is hidden on touch. It showed in landscape and listed only keys.
   - The `E` badge is dropped from the prompt, which is bigger and sits above the stick.
   - Tap targets are bigger: the fold tab grows 26→40px; the backpack button, close/ok buttons,
     reply chips, back, send and home buttons move toward 44px.
   - On narrow screens the driving minimap shrinks so it no longer covers the "get out" prompt,
     and the launch timer moves below the case board and the text toasts.
   - No double-tap zoom, text selection or long-press callout on the UI.
4. **Landscape phone** (`max-height: 500px`):
   - The handset fits the screen. Before, the "put away ✕" button was off-screen, and the drawn
     keypad left only one line for the editor's texts, so the keypad is hidden.
   - The backpack, notebook, cards and end card scroll instead of running off the bottom.
   - The notebook uses `dvh`, so iOS's toolbar doesn't cut it off.
5. **Audio unlock** (`js/bump.js`). The WebAudio context was first created in the middle of a car
   bump, outside a gesture, so iOS Safari would keep it muted. It now opens on the first tap or
   keypress.
6. **Pixel ratio** (`js/main.js`). It's capped at 1.5 on touch devices instead of 1.75: about 27%
   fewer pixels to shade on a DPR-3 iPhone. Desktop is unchanged.
7. The cache token was bumped to `cb=81`. **Not deployed**, and `FEATURE_LOG.md` is not updated
   (the owner should log it on approval).

## Performance (measured in emulation)

| | Portrait | Landscape |
|---|---|---|
| Draw calls (start of play, museum steps) | ~300 | **730–855** |
| Triangles drawn | ~530k | **760–800k** |
| Geometries / textures / shader programs | ~1,500–1,700 / 125–146 / 40 | same |
| JS heap after start | ~116 MB | |
| Canvas (old cap 1.75 → new 1.5 on touch) | 682×1162 → 585×996 | 1162×682 → 996×585 |

- **Page weight is fine:** about 3.0 MB decoded, about 1.5 MB over the wire. That's three.js
  (1.27 MB, about 256 KB gzipped), the game JS (441 KB, about 141 KB gzipped), `critic.glb`
  (434 KB), two or three artwork JPEGs (about 220–320 KB each) and the fonts (132 KB).
- **Load time** in emulation was 17–33 s to the title. Most of that is SwiftShader building the
  planet and compiling shaders; a real phone GPU will be far faster, but the build-the-town-in-JS
  step (`planTown` / `buildTown`) and `renderer.compile` will still be several seconds on a
  mid-range CPU. There's only a text loader ("sharpening pencils…").
- **Likely stutter: draw calls.** 700+ calls in landscape is beyond what a mid-range Android phone
  (Adreno 6xx / Mali-G5x) holds at 60 fps; expect 20–40 fps. The ~800k triangles include the
  inverted-hull ink, which doubles every mesh.
- Memory looks safe: about 116 MB heap, few textures, one GLB. That's well under iOS Safari's
  limit for a tab.
- The phone's Camera app uses `readPixels` (a "GPU stall" warning); it's a one-off per photo and
  fine.

## Prioritised list

| # | Item | Status | Effort |
|---|---|---|---|
| 1 | No way to walk or drive by touch | **fixed here** (thumb stick) | done |
| 2 | Case board, hint strip and phone don't fit a phone screen; landscape phone's "put away" off-screen | **fixed here** | done |
| 3 | iOS audio never unlocks | **fixed here** | done |
| 4 | **Test on real devices** (iPhone in Safari, mid-range Android in Chrome): fps, heat, load time, the stick's feel | todo | S (1–2 h) |
| 5 | **Draw calls in landscape (730–855).** Merge static town meshes per material (the `batchPlaced` path exists), and keep merged ink for far buildings. A "lite" quality on touch could skip the over-stroke boil layer or hide far decoration. | todo | M (1–2 days) |
| 6 | Adaptive resolution: drop the pixel ratio to 1.0–1.25 if the average frame time is above 25 ms | todo | S (2 h) |
| 7 | Keyboard wording left in text: "press E" (case board, getaway card, end card), "P to read" (toasts), "Press P / N" (backpack), "click a line". Swap in "tap" when `body.touch` is set. | todo | S (1 h) |
| 8 | A touch "recenter camera" (C): a small button, or snap behind on a double-tap of the canvas | todo | S |
| 9 | Fullscreen / home screen: add a web manifest (`display: fullscreen`, landscape-friendly) and `apple-mobile-web-app-capable`. iPhone Safari has no element fullscreen. Optionally a "go fullscreen" button on Android. | todo | S |
| 10 | iOS Safari can still page-zoom on a pinch that starts on HUD panels (it ignores `user-scalable`). Add `gesturestart` `preventDefault`. | todo | XS |
| 11 | A progress bar on the loader (the town build takes seconds on a phone) | todo | S |
| 12 | Remaining small targets: `phBack` (about 20×24 before padding), the case-board rows (25px tall) | partly fixed | XS |

## Other notes

- **Orientation:** both work. Portrait shows less of the world but costs about 300 draw calls;
  landscape shows more and costs 2.5× that. No orientation lock is needed.
- **100vh:** the full-screen layers use `inset: 0`, which is fine. The cinematic bars use `11vh`,
  which is harmless. Panels now use `dvh` as well.
- **Pinch:** the game's pinch-to-zoom works (two pointers on the canvas, which has
  `touch-action: none`). The page doesn't scroll (`overflow: hidden`).
- `navigator.vibrate` (the phone buzz) doesn't exist on iOS. The call is already guarded with
  `?.`, so nothing breaks.

## Screenshots (`screenshots/mobile/`)

- `iPhone13-*`, `Pixel7-*`, in `port`/`land`: **baseline `main`** — title, cold open, phone,
  play, notebook, backpack, handset, prompt, talk.
- `fixed-iPhone13-port-*`: **this branch** — play with the stick and the folded board, talk, a
  clue, the accusation, the getaway, driving with the minimap, the countdown, the end card.
- `fixed-iPhone13-land-*`: this branch in landscape (phone, play, backpack, talk). The phone shot was taken just
  before the last handset-height fix, so the "put away" button is still above the frame there. With the fix, a DOM
  measurement at 664×390 puts it 19px from the top and the handset at y=56–378.
