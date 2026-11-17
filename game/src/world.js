// DUSTFALL map: "Dustfall Yard" — an original walled courtyard, 64 x 48 m.
// Two bombsites (A north-west, B north-east), a mid lane past a dry
// fountain, and two side lanes. Attackers spawn south, defenders north.
// All collision is axis-aligned boxes; sightlines are checked against the
// same boxes, so what blocks a bullet blocks a bot's eyes too.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// Every solid: [x0, z0, x1, z1, height]. The outer walls are index 0..3.
const WALLS = [
  [-32, -24, 32, -23, 3.4], // north
  [-32, 23, 32, 24, 3.4], // south
  [-32, -24, -31, 24, 3.4], // west
  [31, -24, 32, 24, 3.4], // east
  // Mid structures: fountain ring walls and lane dividers.
  [-6, -2, -4, 6, 1.1], [-6, -6, -4, -2, 1.1],
  [4, -2, 6, 6, 1.1], [4, -6, 6, -2, 1.1],
  [-14, -8, -12, 2, 2.6], [12, -8, 14, 2, 2.6],
  [-20, 4, -10, 5, 1.1], [10, 4, 20, 5, 1.1],
  // Site A pocket (north-west) and Site B pocket (north-east).
  [-28, -18, -16, -17, 2.8], [-16, -18, -15, -8, 2.8],
  [15, -18, 16, -8, 2.8], [16, -18, 28, -17, 2.8],
  // Defender-side cover walls.
  [-8, -14, -6, -10, 2.2], [6, -14, 8, -10, 2.2],
  [-24, 8, -22, 14, 2.2], [22, 8, 24, 14, 2.2],
];

// Crates and barrels: [x, z, w, d, h, kind]. Crates are climbable cover,
// barrels are low cover. Positions are chosen to break the long sightlines.
const PROPS = [
  [-10, -4, 2.2, 2.2, 1.2, 'crate'], [-9, -2, 1.2, 1.2, 2.4, 'crate'],
  [10, -4, 2.2, 2.2, 1.2, 'crate'], [9, -2, 1.2, 1.2, 2.4, 'crate'],
  [-24, -10, 2.4, 1.6, 1.2, 'crate'], [-19, -11, 1.4, 1.4, 2.4, 'crate'],
  [24, -10, 2.4, 1.6, 1.2, 'crate'], [19, -11, 1.4, 1.4, 2.4, 'crate'],
  [-2, 10, 2.2, 2.2, 1.2, 'crate'], [2, 12, 1.2, 1.2, 2.4, 'crate'],
  [-27, 2, 1.2, 1.2, 1.1, 'barrel'], [27, -2, 1.2, 1.2, 1.1, 'barrel'],
  [-6, 16, 1.2, 1.2, 1.1, 'barrel'], [6, 16, 1.2, 1.2, 1.1, 'barrel'],
  [-14, -16, 1.2, 1.2, 1.1, 'barrel'], [14, -16, 1.2, 1.2, 1.1, 'barrel'],
  [0, -18, 2.4, 1.2, 1.2, 'crate'],
];

// Waypoint graph: nodes bots walk between. Edges are listed by index.
const NODES = [
  [0, 20], [-8, 18], [8, 18], // attacker spawn row
  [-20, 14], [20, 14], [0, 12], // south lanes
  [-26, 4], [26, 4], [-10, 8], [10, 8], // mid-south
  [0, 0], [-14, 0], [14, 0], // mid / fountain
  [-26, -8], [26, -8], [-8, -6], [8, -6], // mid-north
  [-22, -14], [22, -14], // site mouths
  [-24, -19], [22, -19], // inside sites
  [-2, -12], [2, -12], // defender mid
  [-10, -18], [10, -18], // defender back
  [-28, 16], [28, 16], // far lane corners
  [0, -20], // north middle
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 4], [1, 5], [2, 5], [3, 6], [4, 7],
  [3, 8], [4, 9], [5, 8], [5, 9], [6, 11], [7, 12], [8, 10], [9, 10],
  [10, 11], [10, 12], [11, 13], [12, 14], [11, 15], [12, 16],
  [13, 17], [14, 18], [15, 17], [16, 18], [17, 19], [18, 20],
  [15, 21], [16, 22], [21, 23], [22, 24], [19, 25], [20, 26],
  [23, 27], [24, 27], [21, 26], [22, 25], [3, 25], [4, 26],
  [13, 21], [14, 22], [17, 23], [18, 24],
];

export const SITES = {
  A: { x: -22, z: -16, r: 5, color: PALETTE.siteA, letter: 'A' },
  B: { x: 22, z: -16, r: 5, color: PALETTE.siteB, letter: 'B' },
};

export const SPAWNS = {
  van: [[-4, 20], [0, 21], [4, 20], [-8, 19], [8, 19]],
  war: [[-20, -19], [-10, -19], [0, -20], [10, -19], [20, -19]],
};

function sandTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#b98f56'; g.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 5200; i++) {
    const v = 130 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${v}, ${Math.floor(v * 0.72)}, ${Math.floor(v * 0.42)}, 0.3)`;
    g.fillRect(Math.random() * 512, Math.random() * 384, 2, 2);
  }
  // Worn lane strips: mid, left, right.
  g.fillStyle = 'rgba(120, 90, 55, 0.18)';
  g.fillRect(236, 0, 40, 384); g.fillRect(36, 0, 36, 384); g.fillRect(440, 0, 36, 384);
  g.strokeStyle = 'rgba(90, 66, 38, 0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    g.beginPath(); g.moveTo(Math.random() * 512, 0); g.lineTo(Math.random() * 512, 384); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#20242a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, 116, 116);
  g.fillStyle = color; g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  const colliders = [];
  const addBox = (x0, z0, x1, z1, h, mat, y0 = 0) => {
    const w = x1 - x0, d = z1 - z0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    scene.add(m);
    colliders.push({ x0, z0, x1, z1, y0, y1: y0 + h });
    return m;
  };

  const matGround = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.95 });
  const matWall = new THREE.MeshStandardMaterial({ color: 0xa5763f, roughness: 0.9 });
  const matWallTop = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 0.85 });
  const matCrate = new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.9 });
  const matBarrel = new THREE.MeshStandardMaterial({ color: PALETTE.barrel, roughness: 0.6, metalness: 0.35 });
  const matTrim = new THREE.MeshStandardMaterial({ color: PALETTE.tealDark, roughness: 0.7 });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), matGround);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  for (const [x0, z0, x1, z1, h] of WALLS) {
    addBox(x0, z0, x1, z1, h, matWall);
    // A pale cap on tall walls so the skyline reads at a glance.
    if (h > 2.4) addBox(x0, z0, x1, z1, 0.18, matWallTop, h);
  }
  for (const [x, z, w, d, h, kind] of PROPS) {
    if (kind === 'crate') {
      addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, matCrate);
    } else {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, h, 12), matBarrel);
      b.position.set(x, h / 2, z);
      scene.add(b);
      colliders.push({ x0: x - 0.6, z0: z - 0.6, x1: x + 0.6, z1: z + 0.6, y0: 0, y1: h });
    }
  }

  // Dry fountain at mid: a low stone ring with a broken pillar.
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.9, 18), matWallTop);
  ring.position.set(0, 0.45, 0); scene.add(ring);
  colliders.push({ x0: -2.6, z0: -2.6, x1: 2.6, z1: 2.6, y0: 0, y1: 0.9 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 10), matWall);
  pillar.position.set(0, 1.1, 0); scene.add(pillar);

  // Site markers: a painted zone on the ground plus a standing sign board.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const hex = '#' + s.color.toString(16).padStart(6, '0');
    const zone = new THREE.Mesh(
      new THREE.CircleGeometry(s.r, 28),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.16 }),
    );
    zone.rotation.x = -Math.PI / 2; zone.position.set(s.x, 0.02, s.z);
    scene.add(zone);
    const ringLine = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 28),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ringLine.rotation.x = -Math.PI / 2; ringLine.position.set(s.x, 0.03, s.z);
    scene.add(ringLine);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(key, hex), transparent: true }),
    );
    sign.position.set(s.x, 2.6, s.z - s.r + 0.6);
    scene.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), matTrim);
    post.position.set(s.x, 1.3, s.z - s.r + 0.6);
    scene.add(post);
  }

  // Distant skyline silhouettes beyond the walls, so the horizon is not a
  // flat band of sky. Purely visual: outside the playable area.
  const matSky = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 1 });
  const skyline = [
    [-40, -28, 6, 9], [-36, 8, 8, 12], [-38, 26, 5, 7], [38, -26, 7, 10],
    [40, 4, 6, 8], [36, 24, 9, 13], [-8, -32, 10, 8], [14, -32, 7, 11],
    [-16, 32, 8, 7], [6, 32, 6, 10],
  ];
  for (const [x, z, w, h] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), matSky);
    b.position.set(x, h / 2, z);
    scene.add(b);
  }

  // Warm dusk: low sun, dusty fog, pale sky.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 95);
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x6b4a2e, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98a, 1.45);
  sun.position.set(-28, 26, 18);
  scene.add(sun);

  // Waypoint adjacency for BFS.
  const adj = NODES.map(() => []);
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }

  return { colliders, nodes: NODES, adj, sites: SITES, spawns: SPAWNS };
}

// --- Geometry queries, all in plain numbers (no allocations in hot loops) ---

// True when the segment from (ax, ay, az) to (bx, by, bz) is blocked by a
// solid whose top is above the segment at the crossing point.
export function segmentBlocked(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    let t0 = 0, t1 = 1;
    if (dx === 0) { if (ax < c.x0 || ax > c.x1) continue; }
    else {
      let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (dz === 0) { if (az < c.z0 || az > c.z1) continue; }
    else {
      let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    const y = ay + (by - ay) * Math.max(0, t0);
    if (y < c.y1 - 0.02 && ay + (by - ay) * Math.min(1, t1) > c.y0) return true;
  }
  return false;
}

// Distance along the ray (ox, oy, oz) + t*(dx, dy, dz) to the first solid,
// or Infinity. Used for bullet blocking and bot sight checks.
export function rayWalls(colliders, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    let t0 = 0, t1 = best;
    if (dx === 0) { if (ox < c.x0 || ox > c.x1) continue; }
    else {
      let ta = (c.x0 - ox) / dx, tb = (c.x1 - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (dz === 0) { if (oz < c.z0 || oz > c.z1) continue; }
    else {
      let ta = (c.z0 - oz) / dz, tb = (c.z1 - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (dy === 0) { if (oy < c.y0 || oy > c.y1) continue; }
    else {
      let ta = (c.y0 - oy) / dy, tb = (c.y1 - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (t0 < best && t0 >= 0) best = t0;
  }
  return best;
}

// Slide a circle (radius r, standing on y) through the solids. Returns the
// moved position; each axis is tested separately so the fighter slides
// along walls instead of sticking to them.
export function moveCircle(colliders, x, z, dx, dz, r) {
  let nx = x + dx;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.y1 < 0.4) continue; // low props (fountain ring) do not stop feet
    if (z + r > c.z0 && z - r < c.z1 && nx + r > c.x0 && nx - r < c.x1) {
      nx = dx > 0 ? c.x0 - r : c.x1 + r;
      if (Math.abs(nx - x) > Math.abs(dx)) nx = x;
    }
  }
  let nz = z + dz;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.y1 < 0.4) continue;
    if (nx + r > c.x0 && nx - r < c.x1 && nz + r > c.z0 && nz - r < c.z1) {
      nz = dz > 0 ? c.z0 - r : c.z1 + r;
      if (Math.abs(nz - z) > Math.abs(dz)) nz = z;
    }
  }
  nx = Math.max(-31.2, Math.min(31.2, nx));
  nz = Math.max(-23.2, Math.min(23.2, nz));
  return [nx, nz];
}

// Nearest waypoint index to (x, z).
export function nearestNode(nodes, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i][0] - x, dz = nodes[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS path (list of node indices) from a to b on the waypoint graph.
export function findPath(adj, a, b) {
  if (a === b) return [a];
  const prev = new Array(adj.length).fill(-1);
  const q = [a];
  prev[a] = a;
  for (let h = 0; h < q.length; h++) {
    const n = q[h];
    for (const m of adj[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === b) {
          const path = [b];
          let cur = b;
          while (cur !== a) { cur = prev[cur]; path.unshift(cur); }
          return path;
        }
        q.push(m);
      }
    }
  }
  return [a];
}
