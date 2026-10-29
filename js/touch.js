// ─── on-screen controls for phones and tablets ──────────────────────────────
// The game reads one set of pressed key codes (player.st.keys) and listens for
// keydown/keyup on the window. These buttons feed exactly those, so walking,
// driving and steering work the same as on a keyboard. Looking around is still
// a drag on the scene and pinch to zoom, handled in player.js.

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export function createTouchControls(player) {
  if (!IS_TOUCH) return;
  const root = document.getElementById('touch');
  if (!root) return;
  document.body.classList.add('touch');

  // hold to move: the arrows press W/A/S/D, the run button presses Shift
  const holds = [...root.querySelectorAll('[data-hold]')];
  for (const b of holds) {
    const code = b.dataset.hold;
    const down = e => { e.preventDefault(); player.st.keys.add(code); b.classList.add('on'); };
    const up = e => { e.preventDefault(); player.st.keys.delete(code); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // tap buttons: send the same key press the keyboard would (E, P)
  for (const b of root.querySelectorAll('[data-tap]')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      const code = b.dataset.tap;
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // only show the pad while the case is live: not on the title or in the cold open
  setInterval(() => {
    const live = !!player.st.playing && !document.body.classList.contains('cine');
    if (document.body.classList.contains('touch-play') === live) return;
    document.body.classList.toggle('touch-play', live);
    if (!live) for (const b of holds) { player.st.keys.delete(b.dataset.hold); b.classList.remove('on'); }
  }, 200);
}
