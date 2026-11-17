// DUSTFALL player: first-person movement with acceleration and friction,
// pointer-lock look, hitscan fire with spread bloom and recoil, reload,
// weapon switching, grenade throws, and bomb plant/defuse holds. Stopping
// to aim pays: spread grows with speed and with every shot in a burst.
import * as THREE from 'three';
import { WEAPONS, GRENADES, MOVE, GAME } from './config.js';
import { aimDir, fireBullet, giveWeapon, eyeY } from './combat.js';
import { moveCircle } from './world.js';

const _dir = [0, 0, 0];
let bloom = 0;

export function updatePlayer(dt, G) {
  const p = G.player;
  const input = G.input;
  if (!p.alive) return;

  // --- Look ---
  const [mx, my] = input.takeLook();
  const sens = p.weaponId === 'lr50' && G.scoped ? 0.0009 : 0.0022;
  p.yaw -= mx * sens;
  p.pitch -= my * sens;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));

  // --- Move ---
  const fwd = (input.held.has('KeyW') ? 1 : 0) - (input.held.has('KeyS') ? 1 : 0);
  const str = (input.held.has('KeyD') ? 1 : 0) - (input.held.has('KeyA') ? 1 : 0);
  p.crouched = input.held.has('ControlLeft') || input.held.has('ControlRight');
  const sprint = input.held.has('ShiftLeft') && fwd > 0 && !p.crouched;
  const speed = p.crouched ? MOVE.crouch : sprint ? MOVE.sprint : MOVE.walk;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let tx = (-sy * fwd + cy * str) * speed;
  let tz = (-cy * fwd - sy * str) * speed;
  const len = Math.hypot(tx, tz);
  if (len > speed) { tx *= speed / len; tz *= speed / len; }
  const accel = p.onGround ? MOVE.accel : MOVE.accel * MOVE.airControl;
  p.vx = approach(p.vx, tx, accel * dt);
  p.vz = approach(p.vz, tz, accel * dt);
  if (len === 0 && p.onGround) {
    p.vx = approach(p.vx, 0, MOVE.friction * speed * dt);
    p.vz = approach(p.vz, 0, MOVE.friction * speed * dt);
  }
  p.speed = Math.hypot(p.vx, p.vz);
  p.moving = p.speed > 0.6;
  const [nx, nz] = moveCircle(G.world.colliders, p.x, p.z, p.vx * dt, p.vz * dt, MOVE.radius);
  p.x = nx; p.z = nz;

  if (input.wasPressed('Space') && p.onGround) {
    p.vy = MOVE.jumpSpeed;
    p.onGround = false;
  }
  p.vy -= MOVE.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }

  // Footsteps.
  p.stepT = (p.stepT || 0) - dt;
  if (p.moving && p.onGround && p.stepT <= 0) {
    p.stepT = sprint ? 0.32 : 0.42;
    G.sfx.step(0);
  }

  // --- Weapon ---
  const w = WEAPONS[p.weaponId];
  p.fireCd -= dt;
  bloom = Math.max(0, bloom - dt * 0.09);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const need = w.mag - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take; p.reserve -= take;
    }
  }
  const wantFire = G.mouseDown && (w.auto || G.mouseClicked) && (G.phase === 'live' || G.phase === 'planted');
  if (wantFire && p.fireCd <= 0 && p.reloadT <= 0 && !G.buyOpen) {
    if (p.mag > 0) {
      p.fireCd = w.interval;
      p.mag--;
      const moveFactor = Math.min(1, p.speed / MOVE.walk);
      const spread = w.spread + w.moveSpread * moveFactor + bloom;
      aimDir(p.yaw, p.pitch, _dir);
      _dir[0] += (Math.random() - 0.5) * 2 * spread;
      _dir[1] += (Math.random() - 0.5) * 2 * spread;
      _dir[2] += (Math.random() - 0.5) * 2 * spread;
      const n = Math.hypot(_dir[0], _dir[1], _dir[2]);
      _dir[0] /= n; _dir[1] /= n; _dir[2] /= n;
      fireBullet(G, p, _dir);
      bloom = Math.min(0.05, bloom + w.recoil * 0.55);
      p.pitch += w.recoil * (0.7 + Math.random() * 0.6);
      p.yaw += (Math.random() - 0.5) * w.recoil * 0.4;
      if (p.mag === 0) startReload(G, p);
    } else {
      p.fireCd = 0.25;
      G.sfx.dryFire();
      startReload(G, p);
    }
  }
  if (input.wasPressed('KeyR')) startReload(G, p);

  // Number keys: in the buy phase they buy (1-7 = the buy menu rows);
  // in a live round they switch weapons (1-4) and throw grenades (5-7).
  if (G.phase === 'buy') {
    const buyKeys = ['vk9', 'ar77', 'lr50', 'armor', 'he', 'flash', 'smoke'];
    for (let i = 0; i < 7; i++) {
      if (input.wasPressed('Digit' + (i + 1))) { G.game.buyItem(buyKeys[i]); break; }
    }
  } else {
    const slots = ['p9', 'vk9', 'ar77', 'lr50'];
    for (let i = 0; i < 4; i++) {
      if (input.wasPressed('Digit' + (i + 1)) && p.owned[slots[i]] && p.weaponId !== slots[i]) {
        giveWeapon(p, slots[i]);
        G.scoped = false;
        break;
      }
    }
    const gKeys = { Digit5: 'he', Digit6: 'flash', Digit7: 'smoke' };
    for (const code in gKeys) {
      if (input.wasPressed(code) && p.grenades[gKeys[code]] > 0 && p.reloadT <= 0) {
        throwGrenade(G, p, gKeys[code]);
      }
    }
  }

  // Scope (right mouse) only on the sniper.
  G.scoped = G.mouseRight && p.weaponId === 'lr50' && p.alive;

  // --- Bomb plant (attacker carries the bomb) ---
  if (G.phase === 'live' && G.bombCarrier === p && input.held.has('KeyE')) {
    const site = siteUnder(G, p.x, p.z);
    if (site) {
      p.plantT += dt;
      if (p.plantT >= GAME.plantSeconds) {
        p.plantT = 0;
        G.game.plantBomb(site);
      }
    } else p.plantT = 0;
  } else p.plantT = 0;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

export function startReload(G, p) {
  const w = WEAPONS[p.weaponId];
  if (p.reloadT > 0 || p.mag >= w.mag || p.reserve <= 0) return;
  p.reloadT = w.reload;
  G.sfx.reload();
}

export function siteUnder(G, x, z) {
  for (const key of ['A', 'B']) {
    const s = G.world.sites[key];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return key;
  }
  return null;
}

export function throwGrenade(G, f, kind) {
  const g = GRENADES[kind];
  f.grenades[kind]--;
  aimDir(f.yaw, f.pitch, _dir);
  G.grenades.push({
    kind, owner: f,
    x: f.x, y: eyeY(f) - 0.1, z: f.z,
    vx: _dir[0] * 14, vy: _dir[1] * 14 + 3.5, vz: _dir[2] * 14,
    t: kind === 'he' ? 1.6 : kind === 'flash' ? 1.4 : 1.2,
  });
  G.sfx.grenadeThrow();
}

// Keep the camera glued to the player's eyes; scoped FOV for the sniper.
export function updateCamera(G, camera) {
  const p = G.player;
  camera.position.set(p.x, eyeY(p), p.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  camera.rotation.z = 0;
  const targetFov = G.scoped ? 30 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
  // Damage flash and blind overlay are DOM; camera shake only on explosions.
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.3;
    G.shake = Math.max(0, G.shake - 0.03);
  }
}

// A small viewmodel: a dark rifle shape at the bottom-right of the camera.
export function buildViewmodel() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6169, roughness: 0.55, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), mat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), mat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), accent);
  grip.position.set(0, -0.12, 0.12); grip.rotation.x = 0.4;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), mat);
  mag.position.set(0, -0.14, -0.05); mag.rotation.x = 0.15;
  group.add(body, barrel, grip, mag);
  group.scale.setScalar(0.62);
  group.position.set(0.3, -0.3, -0.62);
  group.rotation.y = 0.06;
  return group;
}
