// DUSTFALL demo: the autopilot that plays the game for the title screen's
// attract mode and for the maker's screenshots, plus the ?shot= staging
// that puts a deterministic scene on screen (menu, buy, fight, plant,
// round-end). Nothing here runs in a normal game: it only switches on
// with ?demo=1, and the staged scenes are honest states of the live sim.
import { GAME, WEAPONS } from './config.js';
import { segmentBlocked, nearestNode, findPath } from './world.js';
import { giveWeapon, eyeY } from './combat.js';
import { closeBuy } from './hud.js';

function nearestEnemy(G, f) {
  let best = null, bd = Infinity;
  for (const o of G.fighters) {
    if (o.team === f.team || !o.alive) continue;
    const d = Math.hypot(o.x - f.x, o.z - f.z);
    if (d < bd && !segmentBlocked(G.world.colliders, f.x, eyeY(f), f.z, o.x, eyeY(o), o.z)) {
      bd = d; best = o;
    }
  }
  return best;
}

function turnToward(G, p, tx, tz, ty, dt) {
  const dx = tx - p.x, dz = tz - p.z;
  const wantYaw = Math.atan2(-dx, -dz);
  let dy = wantYaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const step = Math.max(-2.4 * dt, Math.min(2.4 * dt, dy));
  G.input.dx -= step / 0.0022;
  const dist = Math.hypot(dx, dz);
  const wantPitch = Math.atan2(ty - eyeY(p), dist);
  let dp = wantPitch - p.pitch;
  const pstep = Math.max(-2.0 * dt, Math.min(2.0 * dt, dp));
  G.input.dy -= pstep / 0.0022;
  return Math.abs(dy) < 0.06 && Math.abs(dp) < 0.06;
}

export function demoControl(G, dt) {
  const p = G.player;
  const input = G.input;
  G.mouseDown = false;
  input.held.delete('KeyW'); input.held.delete('KeyA');
  input.held.delete('KeyS'); input.held.delete('KeyD');
  input.held.delete('KeyE'); input.held.delete('ShiftLeft');
  if (!p.alive || G.phase === 'title' || G.phase === 'matchEnd') return;

  if (G.phase === 'buy') {
    if (G._demoHoldBuy) return; // staged buy screenshot: keep the menu open
    // The autopilot buys like a first-round player: rifle, armour, HE.
    G._demoBought = (G._demoBought || 0) + dt;
    if (G._demoBought > 0.8 && !G._demoDidBuy) {
      G._demoDidBuy = true;
      G.game.buyItem('ar77');
      G.game.buyItem('armor');
      G.game.buyItem('he');
      closeBuy(G);
    }
    return;
  }
  if (G.phase === 'roundEnd') return;

  const enemy = nearestEnemy(G, p);
  if (enemy) {
    const onTarget = turnToward(G, p, enemy.x, enemy.z, eyeY(enemy) - 0.2, dt);
    // Settle the aim before firing, so a screenshot catches the duel
    // instead of the killfeed after it.
    p._settleT = onTarget ? (p._settleT || 0) + dt : 0;
    if (onTarget && (p._settleT || 0) > 0.2) G.mouseDown = true;
    return;
  }
  p._settleT = 0;
  // No one in sight: push toward the assigned site along the waypoints.
  const site = G.bombPlanted ? G.bombSite : 'A';
  const target = G.world.sites[site];
  const d = Math.hypot(target.x - p.x, target.z - p.z);
  if (G.bombPlanted) {
    turnToward(G, p, target.x, target.z, 1.2, dt);
    input.held.add('KeyW');
    return;
  }
  if (d < 4 && G.bombCarrier === p) {
    turnToward(G, p, target.x, target.z, 1.2, dt);
    input.held.add('KeyE'); // plant the bomb
    return;
  }
  const node = site === 'A' ? 19 : 20;
  if (!p._path || p._dest !== node) {
    p._dest = node;
    p._path = findPath(G.world.adj, nearestNode(G.world.nodes, p.x, p.z), node);
    p._pathI = 0;
  }
  if (p._path && p._pathI < p._path.length) {
    const n = G.world.nodes[p._path[p._pathI]];
    const nd = Math.hypot(n[0] - p.x, n[1] - p.z);
    if (nd < 0.8) p._pathI++;
    else {
      turnToward(G, p, n[0], n[1], 1.2, dt);
      input.held.add('KeyW');
    }
  }
}

// Put a deterministic scene on screen for a screenshot. Called once,
// shortly after boot; the live sim then keeps running under it.
export function stageShot(G, shot) {
  const p = G.player;
  if (shot === 'menu') return; // title screen, menu camera orbits
  G.game.startMatch();
  if (shot === 'buy') {
    // Buy phase with the menu open: the default state after startMatch.
    // Hold the menu open (the autopilot would otherwise buy and close it).
    G._demoHoldBuy = true;
    return;
  }
  if (shot === 'fight') {
    G.phase = 'live';
    G.buyOpen = false;
    G.hud.buy.hidden = true;
    G.banner = null;
    G.hud.banner.hidden = true;
    G.roundTime = 82;
    giveWeapon(p, 'ar77');
    p.x = 0; p.z = 10; p.yaw = 0.15; p.pitch = 0.02;
    p.hp = 100; p.hasArmor = true; p.armor = 100;
    const foes = G.fighters.filter((f) => f.team === 'war' && f.alive);
    // Three wardens duel at the sides of mid, clear of the fountain, with
    // slow reactions so the frame catches the fight. Two more already lie
    // dead where the player dropped them: their killfeed lines, the money
    // (+$600) and the ammunition (25 - 5 shots) all agree with that.
    const spots = [[-6, -3], [6, -4], [-8, -8]];
    foes.slice(0, 3).forEach((f, i) => {
      f.x = spots[i][0]; f.z = spots[i][1];
      f.yaw = Math.PI; // facing the player
      f.target = p; f.reactT = 1.2 + i * 0.5; f.burstLeft = 0;
    });
    const dead = foes.slice(3, 5);
    dead[0].x = 7; dead[0].z = -7;
    dead[1].x = -4; dead[1].z = -9;
    for (const f of dead) { f.hp = 0; f.alive = false; f.deaths = 1; }
    p.kills = 2;
    p.mag = 20;
    G.money = 1400;
    G.events.push({ type: 'kill', attacker: 'You', victim: dead[0].name, headshot: true, team: 'van' });
    G.events.push({ type: 'kill', attacker: 'You', victim: dead[1].name, headshot: false, team: 'van' });
    G.events.push({ type: 'info', text: 'Bomb carrier: You' });
    return;
  }
  if (shot === 'plant') {
    G.phase = 'planted';
    G.buyOpen = false;
    G.hud.buy.hidden = true;
    G.bombPlanted = true;
    G.bombSite = 'A';
    G.bombTime = 32;
    G.bombPos = { x: -22, z: -16 };
    G.roundTime = 48;
    giveWeapon(p, 'ar77');
    p.x = -15; p.z = -10; p.yaw = 0.8; p.pitch = 0.01;
    p.hp = 64; p.hasArmor = true; p.armor = 100;
    // Round 1 money: $800 start + $300 plant reward = $1,100.
    G.money = 1100;
    const foes = G.fighters.filter((f) => f.team === 'war' && f.alive);
    foes[0].x = -23; foes[0].z = -18; foes[0].yaw = Math.PI * 0.8;
    foes[0].target = p; foes[0].reactT = 1.6; foes[0].burstLeft = 0;
    foes[1].x = -18; foes[1].z = -20; foes[1].yaw = Math.PI;
    G.events.push({ type: 'info', text: 'Bomb planted at Site A · +$300' });
    G.banner = { text: 'BOMB PLANTED — SITE A', sub: 'Defend it for 35 seconds', t: 6 };
    return;
  }
  if (shot === 'end') {
    G.score = { van: 2, war: 2 };
    G.round = 5;
    G.game.endRound('van', 'Wardens eliminated');
    return;
  }
}
