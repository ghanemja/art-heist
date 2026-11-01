// ─── QUALITY: the full drawing, or a lighter one for a weak device ──────────
// 'high' is the game as drawn. 'low' (light mode) is for phones and weak laptops: a lower pixel
// ratio cap, half the streamed-in citizens, no ink hull on small far things (and the ink's patches
// dropped on far ground), a coarser distance LOD, and the purely decorative extras skipped.
// It is chosen once up front from what the device says about itself (cores, memory, a phone's
// coarse pointer and small screen, the GPU's name), and again from the first seconds of measured
// frame time: a device that can't keep up is moved to light mode (never back, so nothing flips).
// ?quality=low|high pins it. Nothing here leaves the browser: no reporting of any kind.
const Q = new URLSearchParams(globalThis.location?.search || '').get('quality');
const PIN = Q === 'low' || Q === 'high' ? Q : null;
export const QUALITY = { level: PIN || 'high', low: PIN === 'low', pinned: !!PIN, why: PIN ? 'pinned (?quality=' + PIN + ')' : '', score: 0, gpu: '', subs: [],
  lodTol: 2.5, inkPx: 24, inkPatchPx: 70 };   // (light mode's culler settings: cull.js)

// the GPU's own name, where the browser gives it (Chrome, Edge, Safari: yes; Firefox: a generic one)
function gpuName(gl) {
  try {
    const x = gl.getExtension('WEBGL_debug_renderer_info');
    return String((x && gl.getParameter(x.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}
// a software renderer, a phone or tablet GPU, an old integrated chip
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|mali|adreno|powervr|sgx|videocore|tegra|intel.*(hd graphics|gma)/i;
// a GPU that draws this town without breaking a sweat (Apple M-series, discrete cards)
const STRONG_GPU = /apple m\d|geforce|nvidia|rtx|gtx|radeon (rx|pro)|quadro|iris xe|arc /i;

// up front: what the device says about itself (score ≥ 2 → light)
export function detectQuality(gl) {
  const nav = globalThis.navigator || {};
  const gpu = QUALITY.gpu = gl ? gpuName(gl) : '';
  if (PIN) return QUALITY;
  let s = 0; const why = [];
  const cores = nav.hardwareConcurrency || 0, mem = nav.deviceMemory || 0;
  if (cores && cores <= 4) { s++; why.push(cores + ' cores'); }
  if (mem && mem <= 4) { s++; why.push(mem + ' GB'); }
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches, small = Math.min(screen.width, screen.height) < 600;
  if (coarse && small) { s++; why.push('phone'); }
  if (WEAK_GPU.test(gpu)) { s += 2; why.push('gpu: ' + gpu.slice(0, 60)); }
  else if (STRONG_GPU.test(gpu)) { s -= 2; }
  QUALITY.score = s;
  if (s >= 2) setLow(why.join(', '));
  return QUALITY;
}

// light mode, from now on (things that care subscribe with onQuality)
export function setLow(why) {
  if (QUALITY.low || PIN === 'high') return;
  QUALITY.low = true; QUALITY.level = 'low'; QUALITY.why = why;
  for (const f of QUALITY.subs) try { f(QUALITY); } catch (e) { console.warn('[quality]', e); }
}
export function onQuality(f) { QUALITY.subs.push(f); if (QUALITY.low) f(QUALITY); }

// measured: each frame's time. After a short warm-up (shader compiles, the citizens arriving),
// a window of ~1.5 s whose median is under 22 fps moves a device to light mode at once; later on,
// three windows running at under 30 fps with the resolution already at its floor do too.
const M = { n: 0, ft: [], slow: 0 };
export function watchFrame(ms, atFloor) {
  if (QUALITY.low || PIN) return;
  if (++M.n < 40 || document.hidden || ms > 2000) return;     // (warm-up; a background tab; a deliberate stall)
  M.ft.push(ms); if (M.ft.length < 45) return;
  const med = M.ft.sort((a, b) => a - b)[22]; M.ft.length = 0;
  if (M.n < 200 && med > 45) setLow(`measured ${med.toFixed(0)} ms/frame`);
  else if (med > 33 && atFloor) { if (++M.slow >= 3) setLow(`measured ${med.toFixed(0)} ms/frame at the lowest resolution`); }
  else M.slow = 0;
}
