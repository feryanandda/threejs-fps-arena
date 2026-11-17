// DUSTFALL bootstrap: renderer, fixed-step simulation kept apart from
// rendering, and the pooled visual effects (tracers, sparks, muzzle
// flashes, grenades, smoke, explosions). The sim ticks at 60 Hz; the
// renderer draws whatever state the sim is in. No object is allocated in
// the hot loops: tracers, sparks and flashes come from fixed pools.
import * as THREE from 'three';
import { GAME } from './config.js';
import { buildWorld } from './world.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { createGame } from './game.js';
import { updatePlayer, updateCamera, buildViewmodel } from './player.js';
import { updateBots } from './bots.js';
import { buildHud, updateHud, openBuy, closeBuy } from './hud.js';
import { demoControl, stageShot } from './demo.js';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const SHOT = params.get('shot') || null;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 220);
scene.add(camera);

const world = buildWorld(scene);
const viewmodel = buildViewmodel();
camera.add(viewmodel);

const G = {
  scene, camera, renderer, world,
  input: new Input(renderer.domElement),
  sfx: new Sfx(),
  demo: DEMO, shot: SHOT,
  mouseDown: false, mouseRight: false, mouseClicked: false,
  vx: 0, vz: 0,
};
createGame(G);
buildHud(G);

// --- Pooled effects ---
const tracerPool = [];
for (let i = 0; i < 14; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracerPool.push(line);
}
const sparkPool = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
  );
  scene.add(m);
  sparkPool.push(m);
}
const explosionMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 18, 12),
  new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0 }),
);
scene.add(explosionMesh);
let explosionT = 0;
const grenadeMeshes = new Map();
const smokeMeshes = new Map();
const bombMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: 0x23262b }));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  light.position.set(0, 0.14, 0);
  bombMesh.add(body, light);
  bombMesh.userData.light = light;
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// --- Input wiring ---
G.input.onMouseDown = (btn) => {
  if (btn === 0) { G.mouseDown = true; G.mouseClicked = true; }
  if (btn === 2) G.mouseRight = true;
  if (G.phase === 'title') return;
  if (!G.input.locked && G.phase !== 'buy') G.input.requestLock();
};
G.input.onMouseUp = (btn) => {
  if (btn === 0) G.mouseDown = false;
  if (btn === 2) G.mouseRight = false;
};
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
G.input.onPress = (code) => {
  if (code === 'KeyB' && G.phase === 'buy') {
    if (G.buyOpen) closeBuy(G); else openBuy(G);
  }
  if (code === 'Enter' && G.phase === 'title') {
    G.sfx.ensure();
    G.game.startMatch();
    G.input.requestLock();
  }
  if (code === 'KeyR' && G.phase === 'matchEnd') {
    G.game.startMatch();
    G.input.requestLock();
  }
  if (code === 'KeyM') { G.sfx.muted = !G.sfx.muted; }
};

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Surface boot errors on screen (and on window.__dustfall for the driver).
window.__dustfall = { G, ready: false, error: null };
window.addEventListener('error', (e) => { window.__dustfall.error = String(e.message || e.error); });

// --- Demo / screenshot staging ---
if (DEMO) {
  // The autopilot needs the audio context unlocked; headless has none.
  try { G.sfx.ensure(); } catch { /* silent in headless */ }
  setTimeout(() => stageShot(G, SHOT), 350);
} else if (SHOT) {
  setTimeout(() => stageShot(G, SHOT), 350);
}

const STEP = 1 / GAME.tickHz;
let acc = 0;
let last = performance.now();

function renderEffects(dt) {
  // Tracers: one pooled line per live tracer.
  for (let i = 0; i < tracerPool.length; i++) {
    const line = tracerPool[i];
    const t = G.tracers[i];
    if (t) {
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, t.x0, t.y0, t.z0);
      pos.setXYZ(1, t.x1, t.y1, t.z1);
      pos.needsUpdate = true;
      line.material.color.setHex(t.color);
      line.material.opacity = Math.min(1, t.t / 0.05);
      t.t -= dt;
      if (t.t <= 0) G.tracers.splice(i, 1);
    } else line.material.opacity = 0;
  }
  for (let i = 0; i < sparkPool.length; i++) {
    const m = sparkPool[i];
    const s = G.sparks[i];
    if (s) {
      m.position.set(s.x, s.y, s.z);
      m.material.opacity = Math.min(1, s.t / 0.08);
      s.t -= dt;
      if (s.t <= 0) G.sparks.splice(i, 1);
    } else m.material.opacity = 0;
  }
  // Grenades in flight.
  for (const gr of G.grenades) {
    let mesh = grenadeMeshes.get(gr);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0x23262b }));
      scene.add(mesh);
      grenadeMeshes.set(gr, mesh);
    }
    mesh.position.set(gr.x, gr.y, gr.z);
  }
  for (const [gr, mesh] of [...grenadeMeshes]) {
    if (!G.grenades.includes(gr)) { scene.remove(mesh); grenadeMeshes.delete(gr); }
  }
  // Smoke clouds: one grey puff group per cloud.
  for (const s of G.smokes) {
    let group = smokeMeshes.get(s);
    if (!group) {
      group = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xb8b0a4, transparent: true, opacity: 0.5 }),
        );
        puff.position.set((Math.random() - 0.5) * 5, Math.random() * 1.2, (Math.random() - 0.5) * 5);
        group.add(puff);
      }
      group.position.set(s.x, s.y, s.z);
      scene.add(group);
      smokeMeshes.set(s, group);
    }
    group.children.forEach((puff, i) => {
      puff.material.opacity = 0.28 + Math.sin(G.time * 0.7 + i) * 0.08;
    });
  }
  for (const [s, group] of [...smokeMeshes]) {
    if (!G.smokes.includes(s)) { scene.remove(group); smokeMeshes.delete(s); }
  }
  // The bomb: planted (blinking) or dropped on the ground.
  if (G.bombPlanted && G.bombPos) {
    bombMesh.visible = true;
    bombMesh.position.set(G.bombPos.x, 0.12, G.bombPos.z);
    bombMesh.userData.light.material.color.setHex(Math.sin(G.time * 9) > 0 ? 0xff2a1a : 0x551108);
  } else if (G.bombGround) {
    bombMesh.visible = true;
    bombMesh.position.set(G.bombGround.x, 0.12, G.bombGround.z);
  } else bombMesh.visible = false;
  // Explosion bloom.
  for (const e of G.events) {
    if (e.type === 'explosion') {
      explosionT = 0.6;
      explosionMesh.position.set(e.x, e.y, e.z);
    }
  }
  if (explosionT > 0) {
    explosionT -= dt;
    const k = 1 - explosionT / 0.6;
    explosionMesh.scale.setScalar(0.5 + k * 8);
    explosionMesh.material.opacity = 0.75 * (1 - k);
  } else explosionMesh.material.opacity = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    acc -= STEP;
    steps++;
    if (G.demo) demoControl(G, STEP);
    if (G.phase !== 'title') {
      updatePlayer(STEP, G);
      updateBots(STEP, G);
      G.game.update(STEP);
    }
    G.mouseClicked = false;
    G.input.endTick();
  }
  if (G.phase === 'title') {
    // Menu camera: a slow orbit over the yard.
    const a = G.time + now * 0.00006;
    camera.position.set(Math.sin(a) * 30, 17, Math.cos(a) * 22);
    camera.lookAt(0, 0, -2);
    camera.fov = 60;
    camera.updateProjectionMatrix();
  } else {
    updateCamera(G, camera);
  }
  renderEffects(dt);
  updateHud(G, dt);
  renderer.render(scene, camera);
  window.__dustfall.ready = true;
}

requestAnimationFrame(frame);
