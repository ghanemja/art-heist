// ─── CITIZENS: bystanders out and about ─────────────────────────────────────
// People made in Citizen Maker (github.com/ghanemja/citizen-maker, gouache, seed
// "vanishing"), exported as rigged GLBs with baked clips, slimmed for the browser
// (models/citizens/). They live round the edges of the story and never get in its way:
// They stay in the main town — inside the ring boulevard — never out on the country roads:
//   • walkers pace a stretch of pavement (just past a road's kerb), turning at each end;
//   • cyclists ride the ring boulevard itself, keeping to one lane and pulling out to
//     pass anything in it (your car, the parked car, you);
//   • bystanders stand about downtown with a coffee, a newspaper or a phone.
// Every route is checked against the town's colliders, roads, water and the story's
// people and clues when the town loads, so nobody walks into a building. They are not
// colliders themselves (you walk straight through), they stop to let you pass, and
// the car bumps them like any townsperson (bump.js). Loaded after the game is up.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { R, ROADS, arc, slerpDir, standAt, alignToSurface, yawToFace, onRoad, isWater, nearestRoad } from './world.js';
import { paint, ink, blobShadow } from './style.js';

const SCALE = 0.66;                 // their metres → the town's units: adults come out within ~5% of the critic's ≈1.2
const NEAR = 22;                    // farther than this from the camera's spot: not drawn, not animated
const CAST = [
  { id: 'wren', role: 'walk', pitch: 360, line: 'I was on my DAILY STEPS!' },
  { id: 'yara', role: 'walk', pitch: 380, line: 'Eyes on the ROAD!' },
  { id: 'ada', role: 'walk', pitch: 350, line: 'I just had my hair done!' },
  { id: 'kai', role: 'walk', pitch: 170, line: 'Honestly. This TOWN.' },
  { id: 'teo', role: 'bike', pitch: 190, line: 'Bike lane! BIKE LANE!' },
  { id: 'zara', role: 'bike', pitch: 400, line: 'That was a new bike!' },
  { id: 'dev', role: 'bike', pitch: 160, line: 'I had right of way!' },
  { id: 'june', role: 'stand', act: 'coffee', pitch: 370, line: 'My LATTE!' },
  { id: 'lev', role: 'stand', act: 'read', pitch: 210, line: 'I was on the crossword!' },
  { id: 'iris', role: 'stand', act: 'phone', pitch: 390, line: 'I was MID-TEXT!' },
];

// ── the materials: the town's gouache paint, by the part's role ──
function restyle(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const role = o.userData.role, m = o.material;
    const vc = !!o.geometry.getAttribute('color');
    o.material = paint(vc ? 0xffffff : m.color.getHex(), { vertexColors: vc, soft: role === 'skin' || role === 'hair' || role === 'eye', hatch: role === 'cloth' ? 1 : 0 });
    if (role === 'eye' || role === 'brow') o.userData.noInk = true;
    // skinned bounds are the rest pose's: pad them so a stride or a pedal stroke is never culled
    if (o.isSkinnedMesh) { o.geometry.computeBoundingSphere(); o.geometry.boundingSphere.radius *= 1.6; }
  });
  ink(root, 'fine');
  return root;
}

// ── routes, checked against everything solid ──
const PAD = 0.45;
function clearAt(d, town, avoid) {
  if (isWater(d) || onRoad(d, 0.05)) return false;
  for (const c of town.colliders) if (arc(d, c.dir) < c.r + PAD) return false;
  for (const a of avoid) if (arc(d, a.dir) < a.r) return false;
  return true;
}
// the pavement beside a road: its centre line pushed out past the kerb, one side
function verge(rd, side) {
  const out = [], n = rd.pts.length;
  for (let i = 0; i < n; i++) {
    const p = rd.pts[i], q = rd.pts[Math.min(n - 1, i + 1)], o = rd.pts[Math.max(0, i - 1)];
    const t = q.clone().sub(o).normalize(), lat = new THREE.Vector3().crossVectors(p, t).normalize();
    out.push(p.clone().multiplyScalar(R).addScaledVector(lat, side * (rd.half + 0.6)).normalize());
  }
  return out;
}
// every unbroken run of clear points, at least `min` long
function runs(pts, ok, min) {
  const out = []; let cur = [];
  for (const p of pts) { if (ok(p)) cur.push(p); else { if (cur.length >= min) out.push(cur); cur = []; } }
  if (cur.length >= min) out.push(cur);
  return out;
}
// a walkable stretch is also level enough: no step bigger than a kerb between samples
const level = (run) => run.every((p, i) => !i || Math.abs(standAt(p) - standAt(run[i - 1])) < 0.12);
// nothing overhead: a ray dropped from the sky must reach the ground first (a collider's
// radius can miss the corner of a long building; this can't)
function roofCheck(town) {
  const meshes = [], spheres = [], rc = new THREE.Raycaster(), o = new THREE.Vector3(), dn = new THREE.Vector3();
  for (const root of town.statics) root.traverse((m) => {
    if (!m.isMesh || m.userData.isInk || !m.geometry?.attributes?.position) return;
    m.updateWorldMatrix(true, false);
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const sp = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);
    if (sp.radius > 30) return;                               // the ground itself
    meshes.push(m); spheres.push(sp);
  });
  return (d) => {
    o.copy(d).multiplyScalar(R + 12); dn.copy(d).negate();
    rc.set(o, dn);
    const near = meshes.filter((m, i) => rc.ray.distanceSqToPoint(spheres[i].center) <= spheres[i].radius ** 2);
    if (!near.length) return false;
    const top = standAt(d) + 0.5;
    return rc.intersectObjects(near, false).some((h) => h.point.length() > top);
  };
}
// how much town is round a spot: buildings (not trees or lamps) within a few steps
const townness = (d, town) => town.colliders.reduce((n, c) => n + (c.r >= 0.8 && arc(d, c.dir) < 6 ? 1 : 0), 0);

// the main town: inside the ring boulevard, or on its own pavement. (The ring isn't a
// circle, so this is a point-in-polygon test, flattened onto the ground at its centre.)
function mainArea() {
  const ring = ROADS.find((r) => r.closed);
  if (!ring) return () => true;
  const cen = ring.pts.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
  const e1 = new THREE.Vector3(0, 1, 0).cross(cen).normalize(), e2 = cen.clone().cross(e1).normalize();
  const flat = (d) => [d.dot(e1), d.dot(e2)];
  const poly = ring.pts.map(flat);
  const inside = ([x, y]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return (d) => d.dot(cen) > 0 && (inside(flat(d)) || ring.pts.some((p) => arc(d, p) < ring.half + 1.0));
}

function planWalks(town, avoid, count, covered, inMain) {
  const cands = [];
  for (const rd of ROADS) {
    for (const side of [1, -1]) for (const run of runs(verge(rd, side), (p) => inMain(p) && clearAt(p, town, avoid), 9)) {
      // windows of up to ~12 units, scored by how much town they pass
      for (let a = 0; a + 9 <= run.length; a += 4) {
        const w = run.slice(a, a + 20);
        cands.push({ w, score: townness(w[w.length >> 1], town) + townness(w[0], town) + townness(w[w.length - 1], town) });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score || b.w.length - a.w.length);
  const picked = [];
  for (const { w } of cands) {                                 // the busiest, spread out round the town
    const mid = w[w.length >> 1];
    if (picked.some((r) => arc(r[r.length >> 1], mid) < 6)) continue;
    if (!level(w)) continue;
    if (w.some(covered)) continue;
    picked.push(w);
    if (picked.length === count) break;
  }
  return picked;
}
// one lane of the boulevard, as a loop (side −1 rides it the other way round). Where the
// lane passes close to one of the story's people or clues, it eases out to the middle.
function planLane(side, avoid) {
  const rd = ROADS.find((r) => r.closed) || ROADS[0], n = rd.pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = rd.pts[i], t = rd.pts[(i + 1) % n].clone().sub(rd.pts[(i - 1 + n) % n]).normalize();
    const lat = new THREE.Vector3().crossVectors(p, t).normalize().multiplyScalar(side);
    const at = p.clone().multiplyScalar(R).addScaledVector(lat, 0.45 * rd.half).normalize();
    out.push({ c: p.clone(), lat, half: rd.half, bias: avoid.some((a) => arc(at, a.dir) < 1.8) ? -0.45 : 0 });
  }
  for (let pass = 0; pass < 4; pass++) out.forEach((o, i) => { o.bias = Math.min(o.bias, (out[(i + 1) % n].bias + out[(i - 1 + n) % n].bias) / 2); });
  return side > 0 ? out : out.reverse();
}
// spots to stand: clear pavement in the main town, the busiest first, spread apart and
// off the walkers' stretches
function planSpots(town, avoid, covered, inMain, count, walks) {
  const cands = [];
  for (const rd of ROADS) for (const side of [1, -1]) for (const p of verge(rd, side)) {
    if (inMain(p) && clearAt(p, town, avoid)) cands.push({ p, score: townness(p, town) });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  for (const { p } of cands) {
    if (out.some((t) => arc(t, p) < 5) || walks.some((w) => w.some((q) => arc(q, p) < 2.5)) || covered(p)) continue;
    out.push(p);
    if (out.length === count) break;
  }
  return out;
}

export function createCitizens({ scene, town, game, player, camera }) {
  const list = [];
  const api = { list, update: () => {}, focus: null, near: NEAR };   // focus/near: where and how far to judge 'near' from (dev shots)
  const avoid = [
    ...game.items.map((it) => ({ dir: it.dir, r: it.kind === 'person' ? 3.2 : 2.6 })),
    { dir: game.jeepSpot(), r: 3 },
    { dir: town.museum.dir, r: 7 },                            // the crime scene stays the story's
  ];
  for (const w of game.walkers || []) w.pts.forEach((a, i) => {   // Mabel, Sam and Dot's rounds: keep off them
    const b = w.pts[(i + 1) % w.pts.length], n = Math.max(1, Math.ceil(arc(a, b) / 0.6));
    for (let k = 0; k <= n; k++) avoid.push({ dir: slerpDir(a, b, k / n), r: 1.3 });
  });
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const load = (url) => loader.loadAsync(url).then((g) => { restyle(g.scene); return g; });

  async function build() {
    const covered = roofCheck(town), inMain = mainArea();
    const walks = planWalks(town, avoid, CAST.filter((c) => c.role === 'walk').length, covered, inMain);
    const spots = planSpots(town, avoid, covered, inMain, CAST.filter((c) => c.role === 'stand').length, walks);
    let wi = 0, bi = 0, si = 0;
    for (const C of CAST) {
      const g = await load(`./models/citizens/${C.id}.glb`);
      const root = new THREE.Group(); root.userData.noGround = true;
      const body = g.scene; body.scale.setScalar(SCALE); root.add(body); root.add(blobShadow(0.28));
      const mixer = new THREE.AnimationMixer(body);
      const clips = Object.fromEntries(g.animations.map((a) => [a.name, mixer.clipAction(a)]));
      const c = { ...C, root, body, mixer, clips, dir: new THREE.Vector3(), cur: null, paused: false, wait: 0, lat: 0, latT: 0 };
      const play = (name, fade = 0.25) => {
        if (c.cur === name || !clips[name]) return;
        const next = clips[name].reset().play();
        if (c.cur) clips[c.cur].crossFadeTo(next, fade, false);
        c.cur = name;
      };
      c.play = play;
      if (C.role === 'walk') {
        const run = walks[wi++]; if (!run) continue;           // not enough clear verge: fewer walkers
        c.run = run; c.segs = run.slice(1).map((p, i) => arc(run[i], p)); c.len = c.segs.reduce((a, b) => a + b, 0);
        c.s = (wi * 0.37 % 1) * c.len; c.way = wi % 2 ? 1 : -1;
        c.speed = 1.27 * SCALE * 0.85;                         // a stroll: the clip's own speed, scaled
        clips.walk && (clips.walk.timeScale = 0.85);
        play('walk', 0);
      } else if (C.role === 'bike') {
        const bike = await load(`./models/citizens/${C.id}-bike.glb`);
        bike.scene.scale.setScalar(SCALE); root.add(bike.scene);
        c.bike = bike.scene; c.bikeMixer = new THREE.AnimationMixer(bike.scene);
        if (bike.animations[0]) c.bikeMixer.clipAction(bike.animations[0]).play();
        c.lane = planLane(bi % 3 === 2 ? -1 : 1, game.items); c.i = Math.floor(((bi * 0.33 + 0.1) % 1) * c.lane.length); c.k = 0; bi++;
        c.speed = 2.46 * SCALE;
        play('bike', 0);
      } else {
        const spot = spots[si++]; if (!spot) continue;          // not enough clear pavement: fewer bystanders
        c.spot = spot;
        const prop = await load(`./models/citizens/${C.id}-${C.act}.glb`);
        prop.scene.scale.setScalar(SCALE); root.add(prop.scene);
        c.propMixer = new THREE.AnimationMixer(prop.scene);
        if (prop.animations[0]) c.propMixer.clipAction(prop.animations[0]).play();
        play(C.act, 0);
        const off = (C.id.charCodeAt(0) % 7) * 0.9;            // not all sipping in step
        mixer.setTime(off); c.propMixer.setTime(off);
        const nr = nearestRoad(spot);
        c.face = nr ? nr.point.clone() : spot.clone();          // looking out at the road
      }
      scene.add(root);
      list.push(c);
      // the car bumps them like anyone else (a rider leaves the bike standing)
      game.bumps.add(root, {
        pitch: C.pitch, line: C.line, home: () => c.dir.clone(),
        onAway: () => {
          c.paused = true; c.play('idle', 0.1);
          if (c.bike) { c.bike.updateWorldMatrix(true, false); scene.attach(c.bike); }
        },
        onBack: () => { c.paused = false; if (c.bike) { root.attach(c.bike); c.bike.position.set(0, 0, 0); c.bike.quaternion.identity(); } },
      });
      place(c, 0);
    }
  }

  // ── each frame ──
  const _a = new THREE.Vector3(), _f = new THREE.Vector3();
  function at(c, s) {                                          // a walker's spot on its stretch
    s = Math.max(0, Math.min(c.len - 1e-4, s));
    for (let i = 0; i < c.segs.length; i++) { if (s <= c.segs[i]) return { d: slerpDir(c.run[i], c.run[i + 1], s / c.segs[i]), i }; s -= c.segs[i]; }
    return { d: c.run[c.run.length - 1].clone(), i: c.segs.length - 1 };
  }
  // the nearest thing in the way just ahead (within `ahead` along, `side` across); null if clear
  function blocked(c, fwd, ahead, side) {
    const obs = [player.st.dir];                               // you, on foot or driving
    if (player.st.mode === 'walk') obs.push(game.jeepSpot());  // and the car where you left it
    let best = null, bd = 1e9;
    for (const o of obs) {
      _a.copy(o).sub(c.dir); const along = _a.dot(fwd) * R, across = _a.dot(_f.crossVectors(c.dir, fwd)) * R;
      if (along > -0.3 && along < ahead && Math.abs(across) < side && along < bd) { bd = along; best = o; }
    }
    return best;
  }
  // ride over the seams where road ribbons meet instead of popping up and down them
  const ease = (c, h, dt) => (c.h = c.h == null || !dt ? h : c.h + (h - c.h) * (1 - Math.exp(-12 * dt)));
  function place(c, dt) {
    if (c.role === 'walk') {
      const { d } = at(c, c.s), to = at(c, c.s + c.way * 0.3).d;
      c.dir.copy(d);
      c.root.position.copy(d).multiplyScalar(ease(c, standAt(d), dt));
      if (arc(d, to) > 1e-4) alignToSurface(c.root, d, yawToFace(d, to));
    } else if (c.role === 'bike') {
      const L = c.lane, n = L.length, A = L[c.i], B = L[(c.i + 1) % n];
      const cen = slerpDir(A.c, B.c, c.k), lat = A.lat.clone().lerp(B.lat, c.k).normalize();
      const off = (0.45 + c.lat + A.bias + (B.bias - A.bias) * c.k) * A.half;   // mid-lane; c.lat < 0 swings out to pass
      c.dir.copy(cen).multiplyScalar(R).addScaledVector(lat, off).normalize();
      const nxt = slerpDir(A.c, B.c, Math.min(1, c.k + 0.5)).multiplyScalar(R).addScaledVector(lat, off).normalize();
      c.root.position.copy(c.dir).multiplyScalar(ease(c, standAt(c.dir), dt));
      alignToSurface(c.root, c.dir, yawToFace(c.dir, arc(c.dir, nxt) > 1e-5 ? nxt : B.c));
    } else {
      c.dir.copy(c.spot);
      c.root.position.copy(c.spot).multiplyScalar(standAt(c.spot));
      alignToSurface(c.root, c.spot, yawToFace(c.spot, c.face));
    }
  }
  const _cd = new THREE.Vector3();
  api.update = (dt) => {
    const G = game.G;
    const night = G.state === 'cold';                          // 3:07 a.m.: the streets are empty
    _cd.copy(camera.position).normalize();
    const focus = api.focus || (G.state === 'play' ? player.st.dir : _cd);
    for (const c of list) {
      const busy = game.bumps.busy?.(c.root);
      const far = arc(focus, c.dir) > api.near;
      c.root.visible = !night && (!far || busy);
      if (!c.root.visible) continue;
      if (busy) {                                              // knocked over: walk back once they're up
        c.play(game.bumps.body(c.root)?.state === 'back' ? 'walk' : 'idle', 0.15);
        c.mixer.update(dt); continue;
      }
      if (c.paused) continue;
      if (c.role === 'walk') {
        // someone coming through: stop and let them pass
        const near = player.st.mode === 'walk' && arc(player.st.dir, c.dir) < 1.5;
        if (near || c.wait > 0) { c.wait = Math.max(0, c.wait - dt); c.play('idle'); }
        else {
          c.play('walk');
          c.s += c.way * c.speed * dt;
          if (c.s <= 0 || c.s >= c.len) { c.s = Math.max(0, Math.min(c.len, c.s)); c.way *= -1; c.wait = 1 + (c.id.length % 3) * 0.6; }
        }
      } else if (c.role === 'bike') {
        // something in the lane: ease to whichever side is away from it and pass; only
        // if it's still dead ahead, right there, brake
        const L = c.lane, A = L[c.i], B = L[(c.i + 1) % L.length];
        const fwd = B.c.clone().sub(A.c).normalize();
        const obs = blocked(c, fwd, 4.5, 1.0);
        if (obs) {
          // where it is across the road (in half-widths, same axis as the lane offset), and the
          // way round it with more room: out toward the middle, or tucked in by the kerb
          const oLat = _a.copy(obs).sub(A.c).dot(A.lat) * R / A.half;
          c.latT = Math.abs(-0.45 + A.bias - oLat) >= Math.abs(0.8 + A.bias - oLat) ? -0.9 : 0.35;
        } else c.latT = 0;
        c.lat += (c.latT - c.lat) * (1 - Math.exp(-3 * dt));
        const close = blocked(c, fwd, 1.8, 0.45);
        const brake = close != null;
        const v = brake ? 0 : c.speed;
        c.clips.bike && (c.clips.bike.timeScale = v / c.speed);
        c.bikeMixer.timeScale = v / c.speed;
        c.k += v * dt / (arc(A.c, B.c) || 1e-3);
        while (c.k >= 1) { c.k -= 1; c.i = (c.i + 1) % L.length; }
        c.bikeMixer.update(dt);
      } else c.propMixer?.update(dt);
      c.mixer.update(dt);
      place(c, dt);
    }
  };
  // after the game is up, so the title isn't kept waiting
  setTimeout(() => build().catch((e) => console.warn('[citizens]', e)), 1500);
  return api;
}
