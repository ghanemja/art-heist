// ─── THE CARGO TICKET: a crumpled slip of paper by the station's freight door ──
// In the world: a small sheet of cream card, crumpled — tent-shaped creases along a few fold
// lines and a curled corner — printed with the ticket (destination, the stamp, a perforated
// stub torn off), lying on the paving. On E: the clue card shows the ticket itself, a crinkled
// paper slip with a ripped edge, creases, a red stamp and a scrawl, dropped onto the page.
import * as THREE from 'three';
import { paint, ink } from './style.js';

const W = 0.44, D = 0.25;                                   // the sheet (world units: big enough to spot)
// the crumple: tent folds along a few lines, a little noise, the stub corner curling up
const FOLDS = [[0.8, 0.6, 0.02, 0.05], [-0.5, 0.86, -0.03, 0.035], [0.15, -0.99, 0.01, 0.03], [0.95, -0.3, 0.12, 0.025]];
function crumple(x, z) {
  let h = 0.012;
  for (const [nx, nz, c, k] of FOLDS) h -= k * Math.abs(nx * x + nz * z - c) * 0.35;
  h += 0.003 * Math.sin(x * 61 + z * 13) * Math.sin(z * 47 - x * 7);
  const u = Math.max(0, (x - W * 0.32) / (W * 0.18)), v = Math.max(0, (-z - D * 0.2) / (D * 0.3));
  return h + 0.03 * (u * u + v * v * 0.6) * Math.min(1, u + 0.3);  // (the stub end curls)
}
function face() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 292;
  const c = cv.getContext('2d'), w = 512, h = 292;
  c.fillStyle = '#f2e3b6'; c.fillRect(0, 0, w, h);
  // grubby: a few soft smudges and a coffee ring
  for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(140,110,60,${0.04 + (i % 3) * 0.02})`; c.beginPath(); c.ellipse(40 + i * 53 % 470, 30 + (i * 97) % 240, 40, 22, i, 0, 7); c.fill(); }
  c.strokeStyle = 'rgba(120,80,40,0.22)'; c.lineWidth = 5; c.beginPath(); c.arc(410, 210, 46, 0.4, 5.6); c.stroke();
  // the border, the perforation before the stub
  c.strokeStyle = '#8a6448'; c.lineWidth = 3; c.strokeRect(10, 10, 370, h - 20);
  c.fillStyle = '#8a6448'; for (let y = 16; y < h - 12; y += 14) { c.beginPath(); c.arc(398, y, 3, 0, 7); c.fill(); }
  c.fillStyle = '#2a2230'; c.textBaseline = 'top';
  c.font = '700 34px "Patrick Hand", sans-serif'; c.fillText('CARGO TICKET', 26, 22);
  c.font = '400 22px "Patrick Hand", sans-serif';
  c.fillText('No. 0307 · FREIGHT', 26, 64);
  c.fillText('TO: CAPE FAR SIDE', 26, 104); c.fillText('OVERSIZE · FLAT · 45 ITEMS', 26, 138); c.fillText('ACCT: FRAME & CO.', 26, 172);
  c.font = '400 18px "Patrick Hand", sans-serif'; c.fillText('ADMIT: GOODS ONLY', 420, 30);
  // the red stamp, crooked
  c.save(); c.translate(250, 228); c.rotate(-0.18); c.strokeStyle = 'rgba(200,60,50,0.85)'; c.lineWidth = 4; c.strokeRect(-92, -24, 184, 48);
  c.fillStyle = 'rgba(200,60,50,0.85)'; c.font = '700 26px "Patrick Hand", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PAID · 3:07', 0, 1); c.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  // (the bundled fonts may arrive after this is drawn: redraw then)
  document.fonts?.ready.then(() => { if (!face._again) { face._again = true; const t2 = face(); t.image = t2.image; t.needsUpdate = true; } });
  return t;
}
// the 3D slip, lying flat on its local y = 0
export function crumpledTicket() {
  const g = new THREE.Group();
  // a thin closed slab, crumpled (inked: its outline), and the printed face just over its top
  const slab = new THREE.BoxGeometry(W, 0.008, D, 22, 1, 12), p = slab.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + crumple(p.getX(i), p.getZ(i)));
  slab.computeVertexNormals();
  g.add(new THREE.Mesh(slab, paint(0xeedfb0, { hatch: 0 })));
  const top = new THREE.PlaneGeometry(W * 0.985, D * 0.97, 22, 12); top.rotateX(-Math.PI / 2);
  const q = top.attributes.position;
  for (let i = 0; i < q.count; i++) q.setY(i, crumple(q.getX(i), q.getZ(i)) + 0.0045);
  top.computeVertexNormals();
  const m = new THREE.Mesh(top, paint(0xffffff, { map: face(), hatch: 0 })); m.userData.noInk = true; g.add(m);
  g.rotation.y = 0.4;
  const out = new THREE.Group(); out.add(g);
  return ink(out, 'fine');
}

// ── the card: the ticket itself, as a crinkled, ripped paper slip (inline SVG) ──
export function ticketCard() {
  // the ripped right edge: a jagged line down where the stub was torn off
  let rip = '', y = 8; const R = (k) => { k = Math.sin(k * 12.9898) * 43758.5453; return k - Math.floor(k); };
  for (let i = 0; y < 182; i++) { y += 7 + R(i) * 9; rip += ` L ${296 + R(i + 40) * 12 - 6} ${Math.min(182, y)}`; }
  const outline = `M 10 10 L 300 8 ${rip} L 12 184 Z`;
  // creases: light/dark pairs across the slip
  const creases = [[30, 10, 120, 184], [150, 8, 95, 184], [10, 70, 300, 120], [210, 9, 260, 184]].map(([a, b, c2, d]) =>
    `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}" stroke="rgba(255,255,255,.55)" stroke-width="2"/><line x1="${a + 2}" y1="${b}" x2="${c2 + 2}" y2="${d}" stroke="rgba(110,80,40,.22)" stroke-width="2.4"/>`).join('');
  return `<div class="tkt">
<svg viewBox="0 0 330 196" width="100%" role="img" aria-label="a crumpled cargo ticket">
  <defs>
    <filter id="tktRough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter>
    <filter id="tktGrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 .16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <linearGradient id="tktSh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e9c1"/><stop offset=".45" stop-color="#ecd9a6"/><stop offset=".55" stop-color="#f4e5bb"/><stop offset="1" stop-color="#e2cc93"/></linearGradient>
    <clipPath id="tktClip"><path d="${outline}"/></clipPath>
  </defs>
  <g filter="url(#tktRough)">
    <path d="${outline}" fill="rgba(42,34,48,.25)" transform="translate(4 5)"/>
    <path d="${outline}" fill="url(#tktSh)" stroke="#2a2230" stroke-width="2.2" stroke-linejoin="round"/>
    <g clip-path="url(#tktClip)">
      <rect width="330" height="196" filter="url(#tktGrain)" fill="#000"/>
      ${creases}
      <circle cx="250" cy="140" r="30" fill="none" stroke="rgba(120,80,40,.25)" stroke-width="5" stroke-dasharray="150 40"/>
      <rect x="18" y="18" width="240" height="158" fill="none" stroke="#8a6448" stroke-width="1.6"/>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx="272" cy="${20 + i * 13.5}" r="2.2" fill="#8a6448"/>`).join('')}
      <text x="28" y="44" font-family="Patrick Hand, cursive" font-size="24" font-weight="700" fill="#2a2230">CARGO TICKET</text>
      <text x="28" y="66" font-family="Patrick Hand, cursive" font-size="14" fill="#2a2230">No. 0307 · FREIGHT</text>
      <text x="28" y="92" font-family="Patrick Hand, cursive" font-size="16" fill="#2a2230">TO: CAPE FAR SIDE</text>
      <text x="28" y="112" font-family="Patrick Hand, cursive" font-size="16" fill="#2a2230">OVERSIZE · FLAT · 45 ITEMS</text>
      <text x="28" y="132" font-family="Patrick Hand, cursive" font-size="16" fill="#2a2230">ACCT: FRAME &amp; CO.</text>
      <g transform="translate(160 158) rotate(-9)"><rect x="-62" y="-15" width="124" height="30" fill="none" stroke="rgba(200,60,50,.85)" stroke-width="3"/>
        <text x="0" y="6" text-anchor="middle" font-family="Patrick Hand, cursive" font-size="17" font-weight="700" fill="rgba(200,60,50,.85)">PAID · 3:07</text></g>
      <path d="M 150 128 q 18 -14 34 -2 t 36 -4" fill="none" stroke="#3f5872" stroke-width="1.8" stroke-linecap="round"/>
    </g>
  </g>
  <g transform="translate(300 150) rotate(18)" filter="url(#tktRough)">
    <path d="M 0 0 L 22 -3 L 26 18 L 4 22 Z" fill="#efdcaa" stroke="#2a2230" stroke-width="1.8"/>
  </g>
</svg></div>`;
}
