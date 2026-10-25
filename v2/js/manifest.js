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
  },
  museum: { at: [13, 25], facing: 'town' },
  // the story's places
  sites: {
    station:   { at: [-10, -18], r: 4.5, name: 'Central Station' },
    harbour:   { at: [-20, 10], r: 4.0, name: 'The Harbour' },
    airport:   { at: [30, 92], r: 14, name: 'Airport' },
    launchpad: { at: [-8, -150], r: 5, name: 'Cape Far Side' },
    overlook:  { at: [49, -40], r: 3.5, name: 'Summit Overlook' },
  },
  // Janelle's projects: buildings around town, each a portfolio piece
  projects: [
    { key: 'library',   name: 'The Library', tag: 'the bookshelf', at: [44, 2], style: 'library',
      desc: 'A cozy room holding all my repos as books on a shelf — plus a walkable gallery of my paintings.', enter: '../room.html' },
    { key: 'yarnflow',  name: 'YarnFlow', tag: 'hobby · social', at: [34, 53], style: 'dome',
      desc: 'A crochet studio — patterns as threads you can share, fork, and remix.', url: 'https://ghanemja.github.io/crochet/' },
    { key: 'inbox',     name: 'Inbox Zero', tag: 'tool', at: [2, 58], style: 'tower',
      desc: 'Kanban for email — drag messages between todo / waiting / done.', url: 'https://ghanemja.github.io/inbox-zero-board/' },
    { key: 'charterscope', name: 'CharterScope', tag: 'tool · nlp', at: [-20, 40], style: 'lighthouse',
      desc: 'Flags unusual clauses in maritime shipping contracts before you sign.', url: 'https://ghanemja.github.io/charterscope/' },
    { key: 'deckgpt',   name: 'DeckGPT', tag: 'ai', at: [-12, 76], style: 'arch',
      desc: 'Prompt → branded PowerPoint. Slides that argue back.', url: 'https://pptgpt.netlify.app' },
    { key: 'council',   name: 'The Council', tag: 'ai · agents', at: [10, 124], style: 'dome',
      desc: 'Specialist agents debate with citations; experts score the outcome.' },
    { key: 'brainu',    name: 'Brain U', tag: 'ai · learning', at: [-14, 150], style: 'tower',
      desc: 'Turns paper corpora into an adaptive curriculum with video lessons.' },
    { key: 'sinescape', name: 'Sinescape', tag: 'creative code', at: [16, -110], style: 'arch',
      desc: 'Rebuilds an image from pure math — Fourier brushstrokes.', url: 'https://yeganeh-formula-studio.netlify.app' },
    { key: 'pixels',    name: 'Pixels → Params', tag: 'research', at: [-12, -64], style: 'tower',
      desc: 'Vision-language models for automated CAD design and optimization.', url: 'https://ghanemja.github.io/html/' },
    { key: 'ros2',      name: 'Robot Lab', tag: 'robotics', at: [20, -48], style: 'dome',
      desc: 'ROS2 + depth cameras + QNX — my robotics tutorials and demos.', url: 'https://ghanemja.github.io/ros2_depth_camera_tutorial/' },
  ],
};
