// ─── THE PLAN ────────────────────────────────────────────────────────────────
// Every deliberate placement on the planet, in one file. Positions are
// [lat, lon] in degrees; sizes are world units (a person ≈ 1 tall, a car ≈ 2
// long). On a radius-40 planet one unit ≈ 1.43° of arc.
//
// The world is designed around the heist: a compact downtown with the museum
// on its edge, the places the story sends you (station, harbour, airport,
// launch pad), and Janelle's projects as buildings around town.
export const R = 40;

export default {
  R,
  // geography: shaped features, not noise
  terrain: {
    plateau: { at: [12, 4], r: 21 },          // downtown + boulevard sit on level ground
    sea: { at: [-62, 14], r: 30, depth: 1.8 }, // the southern sea
    bay: { at: [-30, 8], r: 9, depth: 1.5 },   // an inlet of the sea, up to the harbour
    mountain: { at: [52, -42], r: 10, height: 3.6 },
    hills: 0.32,                              // rolling amplitude everywhere else
  },
  town: {
    center: [12, 4],
    radius: 12.5,     // the street grid fits inside this
    pitch: 4.4,       // block spacing
    boulevard: 17,    // the ring road around town
    // Maple Plaza, the strip mall: town-frame [x, y] of its shopfront line, and
    // the reserved circle (kept clear of the boulevard so the ring isn't pushed)
    mall: { at: [27.4, 0.5], zone: [24.8, 0.5], r: 6.0 },
  },
  museum: { at: [13, 25], facing: 'town' },
  // the story's places
  sites: {
    station:   { at: [-10, -18], r: 7.4, shift: -1.45, stop: 3.5, name: 'Central Station' },  // hall + platform + track
    harbour:   { at: [-20, 10], r: 4.0, name: 'The Harbour' },
    airport:   { at: [30, 92], r: 14, name: 'Airport' },
    launchpad: { at: [-8, -150], r: 7, stop: 6.2, name: 'Cape Far Side' },   // the finale: pad, gantry, rocket, crates
    overlook:  { at: [49, -40], r: 3.5, name: 'Summit Overlook' },
  },
  // Janelle's projects: buildings around town, each a portfolio piece
  projects: [
    { key: 'library',   name: 'The Library', tag: 'the bookshelf', at: [44, 2], style: 'library', decor: true },   // scenery only: no portfolio link
    // the shops of ghanemja.github.io's Main Street, each a walk-in shop out here (style = its shop)
    { key: 'behaviors', name: 'Behavior Search', tag: 'the proving ground · research', at: [2, 58], style: 'behaviors',
      desc: 'Search NVIDIA SimReady 3D objects by how they move, not how they look: all 2,166 rigid assets pushed, tilted and dropped in a physics simulator — 106,757 probe runs.', url: 'https://ghanemja.github.io/behaviors/' },
    { key: 'deckgpt',   name: 'DeckGPT', tag: 'picture palace · ai', at: [-12, 76], style: 'deckgpt',
      desc: 'Builds a presentation with you, step by step — Scope, Story, Visuals, then the Deck — in your house style.', url: 'https://pptgpt.netlify.app' },
    { key: 'borrowed-eyes', name: 'Borrowed Eyes', tag: 'optics & menagerie · game', at: [-20, 40], style: 'eyes',
      desc: 'A browser game about how other animals see: photograph 14 hidden animals and borrow their eyes — bee ultraviolet, snake heat pits, bat echolocation, owl night vision.', url: 'https://ghanemja.github.io/borrowed_eyes/' },
    { key: 'yarnflow',  name: 'YarnFlow', tag: 'pattern haberdashery · crochet', at: [34, 53], style: 'yarn',
      desc: 'A crochet studio: watch a pattern get made stitch by stitch in 3D, learn the stitches, and share what you make.', url: 'https://ghanemja.github.io/crochet/' },
    { key: 'splatform', name: 'Splatform', tag: 'paint & supplies · ui library', at: [20, -48], style: 'splat',
      desc: 'Components, painted: a UI library where every button, card and input is made of a real art medium — watercolor, acrylic, charcoal, torn paper or marker.', url: 'https://ghanemja.github.io/art-asset/' },
    { key: 'qr',        name: 'QR Compass', tag: 'the map room · 3d map', at: [-12, -64], style: 'qr',
      desc: "America's biggest companies on a 3D map, each drawn as its own little model — and every model turns into that company's scannable QR code.", url: 'https://ghanemja.github.io/qr/' },
  ],
};
