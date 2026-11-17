// DUSTFALL bots: nine fighters with waypoint routes, roles, a vision cone
// plus line of sight, hearing for gunshots, burst fire with distance and
// movement-scaled aim error, and the objective jobs — planting for the
// attackers, defusing for the defenders. Bots shoot with the same hitscan
// resolver as the player (combat.fireBullet), so a bot's tracer that crosses
// your chest is a real hit, not a dice roll.
import * as THREE from 'three';
import { WEAPONS, BOT, GAME } from './config.js';
import { aimDir, fireBullet, giveWeapon, eyeY, createFighter } from './combat.js';
import { segmentBlocked, moveCircle, nearestNode, findPath } from './world.js';

const _dir = [0, 0, 0];
const _to = [0, 0, 0];
const VAN_COLOR = 0xc98f2e;
const WAR_COLOR = 0x2f8f86;
const SKIN = 0x8a6a44;

const NAMES_VAN = ['Rook', 'Dune', 'Sable', 'Kite'];
const NAMES_WAR = ['Heron', 'Bastion', 'Mire', 'Flint', 'Sable-2'];

export function createBotMesh(team) {
  const group = new THREE.Group();
  const color = team === 'van' ? VAN_COLOR : WAR_COLOR;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.05, 0.42), mat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), dark);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.05), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
  visor.position.set(0, 1.58, -0.19);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.72), dark);
  gun.position.set(0.28, 1.15, -0.4);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.36), dark);
  legs.position.y = 0.18;
  group.add(body, head, visor, gun, legs);
  group.userData = { body, head, gun };
  return group;
}

// Assign each bot its round job. Attackers push a site; defenders hold one.
export function assignRoles(G) {
  const vans = G.fighters.filter((f) => f.team === 'van' && !f.isPlayer);
  const wars = G.fighters.filter((f) => f.team === 'war');
  const vanJobs = [
    { site: 'A', lane: 'left' }, { site: 'B', lane: 'right' },
    { site: 'A', lane: 'mid' }, { site: 'B', lane: 'mid' },
  ];
  vans.forEach((b, i) => {
    b.role = vanJobs[i % vanJobs.length];
    b.destNode = -1;
    b.path = null;
    b.holdT = 0;
    b.investigate = null;
  });
  const warJobs = [
    { site: 'A' }, { site: 'B' }, { site: 'A' }, { site: 'B' }, { site: null },
  ];
  wars.forEach((b, i) => {
    b.role = warJobs[i % warJobs.length];
    b.destNode = -1;
    b.path = null;
    b.holdT = BOT.holdTime * (0.6 + Math.random() * 0.8);
    b.investigate = null;
  });
}

export function spawnBots(G) {
  // Player + 4 Vanguard bots vs 5 Warden bots.
  const teamGear = {
    van: ['vk9', 'ar77', 'vk9', 'ar77'],
    war: ['ar77', 'vk9', 'ar77', 'vk9', 'lr50'],
  };
  G.fighters = [G.player];
  for (let i = 0; i < 4; i++) {
    const s = G.world.spawns.van[i];
    const b = makeBot(G, `van-${i}`, 'van', NAMES_VAN[i], s[0], s[1], Math.PI);
    giveWeapon(b, teamGear.van[i]);
    b.grenades.he = 1;
    G.fighters.push(b);
  }
  for (let i = 0; i < 5; i++) {
    const s = G.world.spawns.war[i];
    const b = makeBot(G, `war-${i}`, 'war', NAMES_WAR[i], s[0], s[1], 0);
    giveWeapon(b, teamGear.war[i]);
    G.fighters.push(b);
  }
  for (const b of G.fighters) {
    if (b.isPlayer) continue;
    b.mesh = createBotMesh(b.team);
    G.scene.add(b.mesh);
  }
}

function makeBot(G, id, team, name, x, z, yaw) {
  return createFighter({ id, team, name, x, z, yaw });
}

function canSee(G, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.viewRange) return false;
  // Facing check: angle between bot's forward and the target.
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const dot = (dx * fx + dz * fz) / (dist || 1);
  if (dot < Math.cos(BOT.fov / 2) && dist > 2) return false;
  return !segmentBlocked(G.world.colliders, a.x, eyeY(a), a.z, b.x, eyeY(b), b.z);
}

function nearestVisibleEnemy(G, b) {
  let best = null, bd = Infinity;
  for (const f of G.fighters) {
    if (f.team === b.team || !f.alive) continue;
    const d = Math.hypot(f.x - b.x, f.z - b.z);
    if (d < bd && canSee(G, b, f)) { bd = d; best = f; }
  }
  return best;
}

function setDest(G, b, node) {
  if (b.destNode === node && b.path) return;
  b.destNode = node;
  b.path = findPath(G.world.adj, nearestNode(G.world.nodes, b.x, b.z), node);
  b.pathI = 0;
}

function moveAlongPath(G, b, dt, speed) {
  if (!b.path || b.pathI >= b.path.length) return true;
  const node = G.world.nodes[b.path[b.pathI]];
  const dx = node[0] - b.x, dz = node[1] - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) { b.pathI++; return b.pathI >= b.path.length; }
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  const [nx, nz] = moveCircle(G.world.colliders, b.x, b.z, vx * dt, vz * dt, 0.35);
  b.x = nx; b.z = nz;
  b.speed = speed;
  b.moving = true;
  b.yaw = Math.atan2(-vx, -vz);
  return false;
}

function siteNode(G, site) {
  return site === 'A' ? 19 : 20;
}

function updateBot(dt, G, b) {
  if (!b.alive) return;
  b.fireCd -= dt;
  b.blindT = Math.max(0, b.blindT - dt);
  if (b.reloadT > 0) {
    b.reloadT -= dt;
    if (b.reloadT <= 0) {
      const w = WEAPONS[b.weaponId];
      b.mag = w.mag; // bots carry unlimited reserve
    }
  }

  // No fighting between rounds: bots hold still and face their lane.
  if (G.phase !== 'live' && G.phase !== 'planted') {
    b.target = null;
    return;
  }

  // --- Perception ---
  const enemy = b.blindT > 0 ? null : nearestVisibleEnemy(G, b);
  if (enemy) {
    if (b.target !== enemy) {
      b.target = enemy;
      b.reactT = BOT.reactionMin + Math.random() * (BOT.reactionMax - BOT.reactionMin);
      b.burstLeft = 0;
    }
    b.lastSeen = { x: enemy.x, z: enemy.z, t: 0 };
  } else if (b.target) {
    if (!b.lastSeen) b.lastSeen = { x: b.target.x, z: b.target.z, t: 0 };
    b.lastSeen.t += dt;
    if (b.lastSeen.t > 1.6) b.target = null;
  }

  // --- Combat ---
  if (b.target && b.target.alive) {
    const t = b.target;
    const dx = t.x - b.x, dz = t.z - b.z;
    const dist = Math.hypot(dx, dz);
    b.yaw = Math.atan2(-dx, -dz);
    b.pitch = Math.atan2(eyeY(t) - 0.25 - eyeY(b), dist);
    b.moving = false;
    b.speed = 0;
    b.reactT -= dt;
    if (b.reactT <= 0 && b.reloadT <= 0) {
      const w = WEAPONS[b.weaponId];
      if (b.burstLeft <= 0) {
        b.burstPause -= dt;
        if (b.burstPause <= 0) {
          b.burstLeft = BOT.burstMin + Math.floor(Math.random() * (BOT.burstMax - BOT.burstMin + 1));
          b.burstPause = BOT.burstPause * (0.7 + Math.random() * 0.6);
        }
      } else if (b.fireCd <= 0) {
        if (b.mag <= 0) { b.reloadT = w.reload; G.sfx.reload(); }
        else {
          b.fireCd = w.interval;
          b.mag--;
          b.burstLeft--;
          const err = BOT.aimError + BOT.errorPerMetre * dist + BOT.moveError * Math.min(1, t.speed / 5);
          const spread = w.spread + err;
          aimDir(b.yaw, b.pitch, _dir);
          _dir[0] += (Math.random() - 0.5) * 2 * spread;
          _dir[1] += (Math.random() - 0.5) * 2 * spread;
          _dir[2] += (Math.random() - 0.5) * 2 * spread;
          const n = Math.hypot(_dir[0], _dir[1], _dir[2]);
          _dir[0] /= n; _dir[1] /= n; _dir[2] /= n;
          fireBullet(G, b, _dir);
        }
      }
    }
    // Strafe while duelling: sidestep every couple of seconds.
    b.strafeT = (b.strafeT || 0) - dt;
    if (b.strafeT <= 0) {
      b.strafeT = 1.2 + Math.random() * 1.4;
      b.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    const sx = Math.cos(b.yaw) * b.strafeDir * 1.6, sz = -Math.sin(b.yaw) * b.strafeDir * 1.6;
    const [nx, nz] = moveCircle(G.world.colliders, b.x, b.z, sx * dt, sz * dt, 0.35);
    b.x = nx; b.z = nz;
    b.speed = 1.6;
    return;
  }

  // --- Objective / movement ---
  b.moving = false;
  b.speed = 0;
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  if (b.team === 'van') {
    if (G.bombPlanted) {
      // Guard the planted bomb: hold near the site.
      const s = G.world.sites[G.bombSite];
      const d = Math.hypot(b.x - s.x, b.z - s.z);
      if (d > 7) { setDest(G, b, siteNode(G, G.bombSite)); moveAlongPath(G, b, dt, BOT.walkSpeed); }
      else { b.holdT -= dt; if (b.holdT <= 0) { b.holdT = 3 + Math.random() * 3; b.yaw += (Math.random() - 0.5) * 2; } }
      return;
    }
    if (G.bombCarrier === b) {
      // Carry the bomb to the assigned site and plant.
      const s = G.world.sites[b.role.site];
      const d = Math.hypot(b.x - s.x, b.z - s.z);
      if (d < 3.5) {
        b.plantT += dt;
        if (b.plantT >= GAME.plantSeconds) { b.plantT = 0; G.game.plantBomb(b.role.site); }
      } else {
        b.plantT = 0;
        setDest(G, b, siteNode(G, b.role.site));
        moveAlongPath(G, b, dt, BOT.walkSpeed * 1.08);
      }
      return;
    }
    if (G.bombGround) {
      // Bomb is down: nearest attacker picks it up.
      const d = Math.hypot(b.x - G.bombGround.x, b.z - G.bombGround.z);
      if (d < 1.2) { G.bombCarrier = b; G.bombGround = null; G.events.push({ type: 'info', text: `${b.name} picked up the bomb` }); }
      else {
        const node = nearestNode(G.world.nodes, G.bombGround.x, G.bombGround.z);
        setDest(G, b, node);
        moveAlongPath(G, b, dt, BOT.walkSpeed);
      }
      return;
    }
    // Push the assigned site.
    setDest(G, b, siteNode(G, b.role.site));
    moveAlongPath(G, b, dt, BOT.walkSpeed);
  } else {
    if (G.bombPlanted) {
      const s = G.world.sites[G.bombSite];
      const d = Math.hypot(b.x - s.x, b.z - s.z);
      if (d < 3) {
        // Defuse when the site looks clear.
        b.defuseT += dt;
        if (b.defuseT >= GAME.defuseSeconds) { b.defuseT = 0; G.game.defuseBomb(b); }
        if (Math.floor(b.defuseT * 4) !== Math.floor((b.defuseT - dt) * 4)) G.sfx.defuseTick();
      } else {
        b.defuseT = 0;
        setDest(G, b, siteNode(G, G.bombSite));
        moveAlongPath(G, b, dt, BOT.walkSpeed * 1.1);
      }
      return;
    }
    if (b.investigate) {
      b.investigate.t -= dt;
      const node = nearestNode(G.world.nodes, b.investigate.x, b.investigate.z);
      setDest(G, b, node);
      if (moveAlongPath(G, b, dt, BOT.walkSpeed * 1.1) || b.investigate.t <= 0) b.investigate = null;
      return;
    }
    // Hold the assigned site; the roamer patrols mid.
    if (b.role.site) {
      const node = siteNode(G, b.role.site);
      const n = G.world.nodes[node];
      const d = Math.hypot(b.x - n[0], b.z - n[1]);
      if (d > 2.5) { setDest(G, b, node); moveAlongPath(G, b, dt, BOT.walkSpeed); }
      else {
        b.holdT -= dt;
        if (b.holdT <= 0) {
          b.holdT = BOT.holdTime * (0.6 + Math.random() * 0.8);
          b.yaw = Math.random() * Math.PI * 2;
        }
      }
    } else {
      b.holdT -= dt;
      if (b.holdT <= 0) {
        b.holdT = 4 + Math.random() * 4;
        setDest(G, b, 10 + Math.floor(Math.random() * 7));
      }
      moveAlongPath(G, b, dt, BOT.walkSpeed * 0.9);
    }
  }
}

export function updateBots(dt, G) {
  for (const b of G.fighters) {
    if (b.isPlayer) continue;
    updateBot(dt, G, b);
    // Sync the mesh: position, facing, walk bob; the dead lie flat.
    if (b.mesh) {
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.alive) {
        b.mesh.rotation.y = b.yaw + Math.PI;
        b.mesh.rotation.x = 0;
        const bob = b.moving ? Math.sin(G.time * 11) * 0.05 : 0;
        b.mesh.position.y = b.y + Math.abs(bob);
      } else {
        b.mesh.rotation.x = -Math.PI / 2;
        b.mesh.position.y = b.y + 0.25;
      }
    }
  }
  // Footsteps for the nearest moving bot, so the player hears approaches.
  G.stepAcc = (G.stepAcc || 0) + dt;
  if (G.stepAcc > 0.45) {
    G.stepAcc = 0;
    let nearest = null, nd = 14;
    for (const b of G.fighters) {
      if (b.isPlayer || !b.alive || !b.moving) continue;
      const d = Math.hypot(b.x - G.player.x, b.z - G.player.z);
      if (d < nd) { nd = d; nearest = b; }
    }
    if (nearest) G.sfx.step(nd);
  }
}
