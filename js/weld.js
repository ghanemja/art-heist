// ─── WELD: three's BufferGeometryUtils.mergeVertices, without its string keys ────────────
// mergeVertices builds a text key for every vertex (each attribute component, scaled and cut to
// an integer, joined with commas) and looks it up in an object: ~1.5 s of the load, mostly the
// strings. This is the same function — the same integer per component, ~~(v · 10^k + ½tol · 10^k),
// vertices joined when every one matches, the first copy kept, the same order, the same output
// geometry (cloned from the input, so its type, groups, draw range and user data come along) —
// with the keys kept as integers in a typed hash table. Anything it isn't sure of (interleaved
// or normalized attributes, morph targets) goes to three's own.
import * as THREE from 'three';
import { mergeVertices as threeMerge } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeVertices(geometry, tolerance = 1e-4) {
  tolerance = Math.max(tolerance, Number.EPSILON);
  const names = Object.keys(geometry.attributes), attrs = names.map(n => geometry.attributes[n]);
  const indices = geometry.getIndex();
  if (attrs.some(a => a.isInterleavedBufferAttribute || a.normalized || !a.array || a.itemSize > 4)
    || names.some(n => geometry.morphAttributes[n]) || (indices && (!indices.array || indices.isInterleavedBufferAttribute))
    || !geometry.attributes.position) return threeMerge(geometry, tolerance);
  const vertexCount = indices ? indices.count : geometry.attributes.position.count;
  // (the same arithmetic as three's, step for step, so the integers are the same)
  const halfTolerance = tolerance * 0.5;
  const exponent = Math.log10(1 / tolerance);
  const hashMultiplier = Math.pow(10, exponent);
  const hashAdditive = halfTolerance * hashMultiplier;
  const NA = attrs.length, sz = attrs.map(a => a.itemSize), src = attrs.map(a => a.array);
  const K = sz.reduce((a, b) => a + b, 0);
  const tmp = attrs.map(a => new a.array.constructor(a.count * a.itemSize));
  const keys = new Int32Array(Math.max(1, vertexCount) * K), key = new Int32Array(K);
  const size = 1 << Math.ceil(Math.log2(vertexCount * 2 + 2)), mask = size - 1, table = new Int32Array(size).fill(-1);
  const newIndices = new Uint32Array(vertexCount), I = indices ? indices.array : null;
  let next = 0, maxI = 0;
  for (let i = 0; i < vertexCount; i++) {
    const index = I ? I[i] : i;
    let h = 0, q = 0;
    for (let a = 0; a < NA; a++) {
      const A = src[a], s = sz[a], o = index * s;
      for (let c = 0; c < s; c++) { const v = ~~(A[o + c] * hashMultiplier + hashAdditive); key[q++] = v; h = Math.imul(h ^ v, 0x9e3779b1) >>> 0; }
    }
    let j = (h ^ (h >>> 15)) & mask, hit = -1;
    while (table[j] >= 0) {
      const u = table[j], b = u * K; let eq = true;
      for (let c = 0; c < K; c++) if (keys[b + c] !== key[c]) { eq = false; break; }
      if (eq) { hit = u; break; }
      j = (j + 1) & mask;
    }
    if (hit < 0) {
      hit = next++; table[j] = hit; keys.set(key, hit * K);
      for (let a = 0; a < NA; a++) { const A = src[a], T = tmp[a], s = sz[a]; for (let c = 0; c < s; c++) T[hit * s + c] = A[index * s + c]; }
    }
    newIndices[i] = hit; if (hit > maxI) maxI = hit;
  }
  // the result: a clone of the input (as three's), its attributes and index replaced. (The clone
  // is made without the old arrays — they'd only be copied to be thrown away.)
  const keepA = geometry.attributes, keepI = geometry.index;
  geometry.attributes = {}; geometry.index = null;
  let result;
  try { result = geometry.clone(); } finally { geometry.attributes = keepA; geometry.index = keepI; }
  names.forEach((n, a) => result.setAttribute(n, new THREE.BufferAttribute(tmp[a].slice(0, next * sz[a]), sz[a], attrs[a].normalized)));
  // (setIndex(array) picks 16 or 32 bits by the largest index: the same here)
  result.setIndex(maxI >= 65535 ? new THREE.Uint32BufferAttribute(newIndices, 1) : new THREE.Uint16BufferAttribute(newIndices, 1));
  return result;
}
