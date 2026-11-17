// DUSTFALL match: phases (title → buy → live → planted → roundEnd →
// matchEnd), the economy, the bomb, grenade physics, and round/match
// verdicts. The simulation is a fixed step kept apart from rendering;
// this module owns the rules, main.js owns the clock.
import { GAME, WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';
import { createFighter, giveWeapon, applyDamage, eyeY } from './combat.js';
import { spawnBots, assignRoles } from './bots.js';
import { segmentBlocked } from './world.js';

export function createGame(G) {
  G.phase = 'title';
  G.round = 1;
  G.score = { van: 0, war: 0 };
  G.lossStreak = 0;
  G.money = GAME.startMoney;
  G.roundTime = GAME.roundSeconds;
  G.buyTime = GAME.buySeconds;
  G.bombTime = GAME.bombSeconds;
  G.bombPlanted = false;
  G.bombSite = null;
  G.bombCarrier = null;
  G.bombGround = null;
  G.bombPos = null;
  G.grenades = [];
  G.smokes = [];
  G.tracers = [];
  G.sparks = [];
  G.shake = 0;
  G.events = [];
  G.killfeed = [];
  G.banner = null;
  G.buyOpen = false;
  G.scoped = false;
  G.mouseDown = false;
  G.mouseRight = false;
  G.mouseClicked = false;
  G.time = 0;
  G.roundWinner = null;
  G.matchWinner = null;

  G.player = createFighter({
    id: 'player', team: 'van', name: 'You', isPlayer: true,
    x: 0, z: 21, yaw: 0,
  });
  G.player.vx = 0; G.player.vz = 0; G.player.stepT = 0;
  spawnBots(G);
  resetPositions(G);

  G.api = {
    startMatch: () => startMatch(G),
    startRound: () => startRound(G),
    endRound: (winner, reason) => endRound(G, winner, reason),
    plantBomb: (site) => plantBomb(G, site),
    defuseBomb: (bot) => defuseBomb(G, bot),
    buyItem: (id) => buyItem(G, id),
    aliveCount: (team) => aliveCount(G, team),
    update: (dt) => updateGame(dt, G),
  };
  G.game = G.api;
  return G;
}

function resetPositions(G) {
  const place = (f, i, list) => {
    const s = list[i % list.length];
    f.x = s[0]; f.z = s[1]; f.y = 0; f.vy = 0;
    f.alive = true; f.hp = 100;
    f.fireCd = 0; f.reloadT = 0; f.burstLeft = 0; f.target = null;
    f.plantT = 0; f.defuseT = 0; f.blindT = 0;
    f.path = null; f.investigate = null;
    if (f.mesh) { f.mesh.rotation.x = 0; f.mesh.visible = true; }
  };
  G.fighters.forEach((f, i) => {
    if (f.team === 'van') place(f, f.isPlayer ? 1 : i, G.world.spawns.van);
    else place(f, i, G.world.spawns.war);
  });
  // Attackers face north (toward the sites); defenders face south.
  for (const f of G.fighters) f.yaw = f.team === 'van' ? 0 : Math.PI;
  G.player.yaw = 0;
  G.player.pitch = 0;
  G.player.vx = 0; G.player.vz = 0;
}

function startMatch(G) {
  G.round = 1;
  G.score = { van: 0, war: 0 };
  G.lossStreak = 0;
  G.money = GAME.startMoney;
  G.matchWinner = null;
  for (const f of G.fighters) {
    f.kills = 0; f.deaths = 0;
    f.owned = { p9: true };
    giveWeapon(f, 'p9');
    f.grenades = { he: 0, flash: 0, smoke: 0 };
    f.hasArmor = false; f.armor = 0;
  }
  G.killfeed = [];
  startRound(G);
}

function startRound(G) {
  resetPositions(G);
  assignRoles(G);
  G.phase = 'buy';
  G.buyTime = GAME.buySeconds;
  G.roundTime = GAME.roundSeconds;
  G.bombTime = GAME.bombSeconds;
  G.bombPlanted = false;
  G.bombSite = null;
  G.bombGround = null;
  G.bombCarrier = G.player;
  G.grenades = [];
  G.smokes = [];
  // The buy menu opens from the HUD (updateHud calls openBuy when the
  // phase is 'buy' and it is not open); the flag alone does not show it.
  // _buyMenuOpened keeps the HUD from re-opening it after the player
  // closes it with B or DEPLOY.
  G.buyOpen = false;
  G._buyMenuOpened = false;
  G.banner = { text: `ROUND ${G.round} — BUY PHASE`, sub: 'Press B for the buy menu · click DEPLOY when ready', t: 3 };
  G.events.push({ type: 'info', text: `Round ${G.round} — buy phase` });
  G.sfx.roundStart();
}

function aliveCount(G, team) {
  return G.fighters.filter((f) => f.team === team && f.alive).length;
}

function endRound(G, winner, reason) {
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
  G.phase = 'roundEnd';
  G.roundWinner = winner;
  G.score[winner]++;
  G.roundEndT = 4.5;
  const playerWon = winner === 'van';
  const reward = playerWon ? GAME.winReward : Math.min(GAME.maxLossReward, GAME.lossReward + G.lossStreak * GAME.lossStreakBonus);
  G.money += reward;
  G.lossStreak = playerWon ? 0 : G.lossStreak + 1;
  G.banner = {
    text: playerWon ? 'ROUND WON' : 'ROUND LOST',
    sub: `${reason} · ${playerWon ? '+' : ''}$${reward} · Vanguard ${G.score.van} — ${G.score.war} Wardens`,
    t: 4,
  };
  G.events.push({ type: 'banner', text: G.banner.text });
  if (playerWon) G.sfx.roundWin(); else G.sfx.roundLose();
  if (G.score[winner] >= GAME.winsNeeded) {
    G.phase = 'matchEnd';
    G.matchWinner = winner;
    G.banner = {
      text: winner === 'van' ? 'DUSTFALL IS YOURS' : 'WARDENS HOLD THE YARD',
      sub: `Final score Vanguard ${G.score.van} — ${G.score.war} Wardens · press R to play again`,
      t: 0,
    };
  }
}

function plantBomb(G, site) {
  if (G.phase !== 'live' || G.bombPlanted) return;
  G.bombPlanted = true;
  G.bombSite = site;
  G.phase = 'planted';
  G.bombTime = GAME.bombSeconds;
  const s = G.world.sites[site];
  G.bombPos = { x: s.x, z: s.z };
  G.money += GAME.plantReward;
  G.events.push({ type: 'info', text: `Bomb planted at Site ${site} · +$${GAME.plantReward}` });
  G.events.push({ type: 'banner', text: `BOMB PLANTED — SITE ${site}` });
  G.banner = { text: `BOMB PLANTED — SITE ${site}`, sub: 'Defend it for 35 seconds', t: 3 };
  G.sfx.plantBeep(true);
}

function defuseBomb(G, bot) {
  if (!G.bombPlanted) return;
  G.bombPlanted = false;
  G.events.push({ type: 'info', text: `${bot.name} defused the bomb` });
  endRound(G, 'war', 'Bomb defused');
}

function buyItem(G, id) {
  if (G.phase !== 'buy') return false;
  const p = G.player;
  if (WEAPONS[id]) {
    const w = WEAPONS[id];
    if (p.owned[id] || G.money < w.price) { G.sfx.deny(); return false; }
    G.money -= w.price;
    giveWeapon(p, id);
  } else if (id === 'armor') {
    if (p.hasArmor || G.money < ARMOR_PRICE) { G.sfx.deny(); return false; }
    G.money -= ARMOR_PRICE;
    p.hasArmor = true; p.armor = 100;
  } else if (GRENADES[id]) {
    const g = GRENADES[id];
    if (G.money < g.price || p.grenades[id] >= 2) { G.sfx.deny(); return false; }
    G.money -= g.price;
    p.grenades[id]++;
  } else return false;
  G.sfx.buy();
  return true;
}

function explodeGrenade(G, gr) {
  const g = GRENADES[gr.kind];
  if (gr.kind === 'he') {
    G.sfx.explosion(Math.hypot(gr.x - G.player.x, gr.z - G.player.z));
    G.events.push({ type: 'explosion', x: gr.x, y: gr.y, z: gr.z });
    const dp = Math.hypot(G.player.x - gr.x, G.player.z - gr.z);
    if (dp < 9) G.shake = Math.max(G.shake, 1 - dp / 9);
    for (const f of G.fighters) {
      if (!f.alive || f === gr.owner) continue;
      const d = Math.hypot(f.x - gr.x, f.z - gr.z);
      if (d < g.radius) {
        const dmg = Math.round(g.damage * (1 - d / (g.radius * 1.4)));
        applyDamage(G, f, Math.max(12, dmg), 'body', gr.owner);
      }
    }
  } else if (gr.kind === 'flash') {
    G.sfx.flashPop(Math.hypot(gr.x - G.player.x, gr.z - G.player.z));
    G.events.push({ type: 'flash', x: gr.x, y: gr.y, z: gr.z });
    for (const f of G.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - gr.x, (f.y + 1.5) - gr.y, f.z - gr.z);
      if (d > g.radius) continue;
      // A flash only blinds fighters with a line of sight to the pop.
      if (segmentBlocked(G.world.colliders, f.x, eyeY(f), f.z, gr.x, gr.y, gr.z)) continue;
      f.blindT = Math.max(f.blindT, g.blind * (1 - d / (g.radius * 1.6)));
      if (f.isPlayer) G.events.push({ type: 'flashPlayer', strength: f.blindT });
    }
  } else {
    G.smokes.push({ x: gr.x, y: gr.y + 0.4, z: gr.z, t: g.life, r: g.radius });
    G.events.push({ type: 'smoke', x: gr.x, y: gr.y, z: gr.z });
  }
}

function updateGrenades(dt, G) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const gr = G.grenades[i];
    gr.vy -= 12 * dt;
    gr.x += gr.vx * dt; gr.y += gr.vy * dt; gr.z += gr.vz * dt;
    gr.t -= dt;
    let boom = gr.t <= 0;
    if (gr.y <= 0.1) { gr.y = 0.1; boom = true; }
    if (boom) {
      explodeGrenade(G, gr);
      G.grenades.splice(i, 1);
    }
  }
  for (let i = G.smokes.length - 1; i >= 0; i--) {
    G.smokes[i].t -= dt;
    if (G.smokes[i].t <= 0) G.smokes.splice(i, 1);
  }
}

function updateGame(dt, G) {
  G.time += dt;
  if (G.phase === 'title' || G.phase === 'matchEnd') return;
  if (G.phase === 'roundEnd') { roundEndTick(dt, G); return; }

  if (G.phase === 'buy') {
    G.buyTime -= dt;
    if (G.buyTime <= 0) {
      G.phase = 'live';
      G.buyOpen = false;
      G.banner = { text: 'GO — TAKE A SITE', sub: 'Plant the bomb at A or B · first to 7 rounds', t: 2.5 };
      G.sfx.roundStart();
    }
    return;
  }

  // Live and planted phases share the clock and the win checks.
  G.roundTime -= dt;
  if (G.bombPlanted) {
    G.bombTime -= dt;
    const whole = Math.ceil(G.bombTime);
    if (whole !== G._lastBeep && whole <= 10) { G._lastBeep = whole; G.sfx.plantBeep(); }
    if (G.bombTime <= 0) {
      G.bombPlanted = false;
      G.events.push({ type: 'explosion', x: G.bombPos.x, y: 1, z: G.bombPos.z });
      G.sfx.explosion(Math.hypot(G.bombPos.x - G.player.x, G.bombPos.z - G.player.z));
      const d = Math.hypot(G.player.x - G.bombPos.x, G.player.z - G.bombPos.z);
      if (d < 10) G.shake = 1;
      for (const f of G.fighters) {
        if (!f.alive) continue;
        const fd = Math.hypot(f.x - G.bombPos.x, f.z - G.bombPos.z);
        if (fd < 9) applyDamage(G, f, 200, 'body', null);
      }
      endRound(G, 'van', 'Bomb detonated');
      return;
    }
  }
  updateGrenades(dt, G);

  // Bomb carrier died: the bomb drops where they fell.
  if (G.bombCarrier && !G.bombCarrier.alive && !G.bombPlanted) {
    G.bombGround = { x: G.bombCarrier.x, z: G.bombCarrier.z };
    G.bombCarrier = null;
    G.events.push({ type: 'info', text: 'Bomb dropped' });
  }

  const vanAlive = aliveCount(G, 'van');
  const warAlive = aliveCount(G, 'war');
  if (vanAlive === 0) { endRound(G, 'war', 'Vanguard eliminated'); return; }
  if (warAlive === 0) { endRound(G, 'van', 'Wardens eliminated'); return; }
  if (G.roundTime <= 0 && !G.bombPlanted) { endRound(G, 'war', 'Time expired — bomb never planted'); }
}

export function roundEndTick(dt, G) {
  if (G.phase !== 'roundEnd') return;
  G.roundEndT -= dt;
  if (G.roundEndT <= 0) {
    G.round++;
    startRound(G);
  }
}
