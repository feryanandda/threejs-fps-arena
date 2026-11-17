// DUSTFALL combat: one fighter shape for the player and every bot, and
// one hitscan resolver both sides use. A shot is a ray from the muzzle
// against wall boxes first, then body and head boxes: the head box pays
// double. Armor soaks half of what gets through.
import { WEAPONS, MOVE } from './config.js';
import { rayWalls } from './world.js';

export function createFighter(opts) {
  return {
    id: opts.id,
    team: opts.team, // 'van' (attackers) or 'war' (defenders)
    name: opts.name,
    isPlayer: !!opts.isPlayer,
    alive: true,
    x: opts.x, z: opts.z, y: 0, vy: 0,
    yaw: opts.yaw || 0, pitch: 0,
    hp: 100, armor: 0, hasArmor: false,
    weaponId: 'p9',
    owned: { p9: true },
    mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve,
    grenades: { he: 0, flash: 0, smoke: 0 },
    fireCd: 0, reloadT: 0, burstLeft: 0, burstPause: 0,
    speed: 0, moving: false, crouched: false, onGround: true,
    blindT: 0, deafT: 0,
    mesh: null, // bots get a three.js group; the player has none
    kills: 0, deaths: 0,
    // AI scratch (bots only): current waypoint path, target node, aim point.
    path: null, pathI: 0, holdT: 0, target: null, reactT: 0, destNode: -1,
    investigate: null, plantT: 0, defuseT: 0,
  };
}

export function giveWeapon(f, id) {
  const w = WEAPONS[id];
  f.owned[id] = true;
  f.weaponId = id;
  f.mag = w.mag;
  f.reserve = w.reserve;
  f.reloadT = 0;
  f.fireCd = 0;
}

export function eyeY(f) {
  return f.y + (f.crouched ? MOVE.crouchEye : MOVE.eyeHeight);
}

// Body and head boxes of a fighter, in world space. Standing height is
// 1.7 m; crouching shrinks both boxes.
function fighterBoxes(f, out) {
  const top = f.y + (f.crouched ? 1.15 : 1.7);
  const chest = f.y + (f.crouched ? 0.85 : 1.32);
  out.body = { x0: f.x - 0.35, x1: f.x + 0.35, z0: f.z - 0.35, z1: f.z + 0.35, y0: f.y, y1: chest };
  out.head = { x0: f.x - 0.22, x1: f.x + 0.22, z0: f.z - 0.22, z1: f.z + 0.22, y0: chest, y1: top };
  return out;
}

const _boxes = { body: null, head: null };

// Slab test of a ray against one axis-aligned box. Returns t or Infinity.
function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let t0 = 0, t1 = maxDist;
  if (dx === 0) { if (ox < b.x0 || ox > b.x1) return Infinity; }
  else {
    let ta = (b.x0 - ox) / dx, tb = (b.x1 - ox) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  if (dz === 0) { if (oz < b.z0 || oz > b.z1) return Infinity; }
  else {
    let ta = (b.z0 - oz) / dz, tb = (b.z1 - oz) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  if (dy === 0) { if (oy < b.y0 || oy > b.y1) return Infinity; }
  else {
    let ta = (b.y0 - oy) / dy, tb = (b.y1 - oy) / dy;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0 >= 0 ? t0 : Infinity;
}

// One hitscan shot. Returns the closest thing the ray meets: a fighter
// (with 'head' or 'body'), a wall, or nothing within maxDist.
export function rayShoot(G, ox, oy, oz, dx, dy, dz, maxDist, exclude) {
  let wall = rayWalls(G.world.colliders, ox, oy, oz, dx, dy, dz, maxDist);
  let best = null, bestT = wall;
  for (const f of G.fighters) {
    if (!f.alive || f === exclude) continue;
    fighterBoxes(f, _boxes);
    const th = rayBox(ox, oy, oz, dx, dy, dz, _boxes.head, maxDist);
    if (th < bestT) { bestT = th; best = { fighter: f, part: 'head', dist: th }; }
    const tb = rayBox(ox, oy, oz, dx, dy, dz, _boxes.body, maxDist);
    if (tb < bestT) { bestT = tb; best = { fighter: f, part: 'body', dist: tb }; }
  }
  if (best) {
    best.point = [ox + dx * bestT, oy + dy * bestT, oz + dz * bestT];
    return best;
  }
  if (wall < maxDist) return { wall: true, dist: wall, point: [ox + dx * wall, oy + dy * wall, oz + dz * wall] };
  return { dist: maxDist, point: [ox + dx * maxDist, oy + dy * maxDist, oz + dz * maxDist] };
}

// Direction from yaw/pitch into out[3]. Yaw 0 looks toward -z (north).
export function aimDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

// Apply a hit. Returns true when the target died.
export function applyDamage(G, target, dmg, part, attacker) {
  if (!target.alive) return false;
  let left = dmg;
  if (target.hasArmor && target.armor > 0) {
    const soaked = Math.min(target.armor, left * 0.5);
    target.armor -= soaked;
    left -= soaked;
  }
  target.hp -= left;
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  if (attacker) attacker.kills++;
  G.events.push({
    type: 'kill', attacker: attacker ? attacker.name : '—', victim: target.name,
    headshot: part === 'head', team: attacker ? attacker.team : null,
  });
  if (target.isPlayer) G.events.push({ type: 'playerDied' });
  if (attacker && attacker.isPlayer) {
    G.money += 300;
    G.events.push({ type: 'reward', text: '+$300 elimination' });
  }
  return true;
}

// Fire one bullet from fighter f toward direction dir (already spread).
// Resolves the hit, spawns a tracer, plays the shot. Returns the hit.
export function fireBullet(G, f, dir) {
  const w = WEAPONS[f.weaponId];
  const ox = f.x, oy = eyeY(f), oz = f.z;
  const hit = rayShoot(G, ox, oy, oz, dir[0], dir[1], dir[2], w.range, f);
  const dist = f.isPlayer ? 0 : Math.hypot(f.x - G.player.x, f.z - G.player.z);
  G.sfx.shot(f.weaponId, dist);
  G.tracers.push({ x0: ox, y0: oy, z0: oz, x1: hit.point[0], y1: hit.point[1], z1: hit.point[2], color: w.tracer, t: 0.09 });
  if (hit.fighter) {
    const dmg = w.damage * (hit.part === 'head' ? w.headMult : 1);
    const died = applyDamage(G, hit.fighter, dmg, hit.part, f);
    if (f.isPlayer) {
      G.events.push({ type: 'hitmark', kill: died, headshot: hit.part === 'head' });
      G.sfx.hit();
      if (died) G.sfx.kill();
    } else if (hit.fighter.isPlayer) {
      G.events.push({ type: 'hurt', from: f });
      G.sfx.hurt();
    }
    // Gunfire is loud: nearby bots turn toward it.
    hearShot(G, f);
  } else if (hit.wall) {
    G.sparks.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], t: 0.15 });
    hearShot(G, f);
  }
  return hit;
}

export function hearShot(G, shooter) {
  for (const b of G.fighters) {
    if (!b.alive || b.isPlayer || b === shooter) continue;
    const d = Math.hypot(b.x - shooter.x, b.z - shooter.z);
    if (d < 28 && !b.target) b.investigate = { x: shooter.x, z: shooter.z, t: 4 };
  }
}
