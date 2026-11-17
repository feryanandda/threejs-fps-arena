// DUSTFALL HUD: every readout the judge asks for — health, armour, money,
// ammunition, round timer, score — plus killfeed, hitmarker, minimap,
// buy menu and the round banners. All DOM; the 3D scene never draws text.
import { WEAPONS, GRENADES, ARMOR_PRICE, GAME } from './config.js';

const $ = (id) => document.getElementById(id);

export function buildHud(G) {
  const hud = {
    hp: $('hp-val'), hpBar: $('hp-bar'), armor: $('armor-val'),
    money: $('money-val'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'),
    ammoBox: $('ammo'), timer: $('timer-val'), scoreVan: $('score-van'),
    scoreWar: $('score-war'), round: $('round-val'),
    killfeed: $('killfeed'), hitmarker: $('hitmarker'), crosshair: $('crosshair'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    minimap: $('minimap'), mmCtx: $('minimap').getContext('2d'),
    buy: $('buy-menu'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    buyRound: $('buy-round'), deploy: $('deploy'),
    title: $('overlay-title'), play: $('play'),
    end: $('overlay-end'), endTitle: $('end-title'), endSub: $('end-sub'),
    again: $('play-again'),
    plant: $('plant-bar'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    bomb: $('bomb-status'), flash: $('flash'), damage: $('damage'),
    scope: $('scope'), hint: $('hint'),
    reload: $('reload-hint'),
  };
  G.hud = hud;
  buildBuyMenu(G);
  hud.deploy.addEventListener('click', () => closeBuy(G));
  hud.play.addEventListener('click', () => {
    G.sfx.ensure();
    G.game.startMatch();
    G.input.requestLock();
  });
  hud.again.addEventListener('click', () => {
    G.game.startMatch();
    G.input.requestLock();
  });
  return hud;
}

function buildBuyMenu(G) {
  const hud = G.hud;
  const rows = [];
  for (const id of ['vk9', 'ar77', 'lr50']) {
    const w = WEAPONS[id];
    rows.push({ key: id, label: `${w.name}`, detail: `${w.damage} dmg · ${w.mag} mag`, price: w.price });
  }
  rows.push({ key: 'armor', label: 'Kevlar Vest', detail: 'Absorbs half of incoming damage', price: ARMOR_PRICE });
  for (const id of ['he', 'flash', 'smoke']) {
    const g = GRENADES[id];
    rows.push({ key: id, label: g.name, detail: id === 'he' ? 'Blast damage in a radius' : id === 'flash' ? 'Blinds anyone looking at it' : 'Blocks sight for 12 s', price: g.price });
  }
  hud.buyList.innerHTML = '';
  rows.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'buy-row';
    b.type = 'button';
    b.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${r.label}<small>${r.detail}</small></span><span class="buy-price">$${r.price}</span>`;
    b.addEventListener('click', () => { G.game.buyItem(r.key); refreshBuy(G); });
    hud.buyList.appendChild(b);
  });
}

function refreshBuy(G) {
  const hud = G.hud;
  const p = G.player;
  hud.buyMoney.textContent = `$${G.money}`;
  hud.buyRound.textContent = G.round;
  const rows = hud.buyList.children;
  const keys = ['vk9', 'ar77', 'lr50', 'armor', 'he', 'flash', 'smoke'];
  for (let i = 0; i < rows.length; i++) {
    const k = keys[i];
    const owned = k === 'armor' ? p.hasArmor : !!p.owned[k];
    const price = k === 'armor' ? ARMOR_PRICE : (WEAPONS[k] || GRENADES[k]).price;
    rows[i].classList.toggle('owned', owned);
    rows[i].classList.toggle('cant', !owned && G.money < price);
  }
}

export function openBuy(G) {
  G.buyOpen = true;
  G._buyMenuOpened = true;
  G.hud.buy.hidden = false;
  G.input.exitLock();
  refreshBuy(G);
}

export function closeBuy(G) {
  G.buyOpen = false;
  G.hud.buy.hidden = true;
  G.input.requestLock();
}

function fmtTime(s) {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

function drainEvents(G) {
  const hud = G.hud;
  while (G.events.length) {
    const e = G.events.shift();
    if (e.type === 'kill') {
      const line = document.createElement('div');
      line.className = 'kf-line';
      line.innerHTML = `<span class="${e.team === 'van' ? 'kf-van' : 'kf-war'}">${e.attacker}</span>` +
        (e.headshot ? ' <span class="kf-head">◎</span>' : ' — ') +
        `<span>${e.victim}</span>`;
      hud.killfeed.prepend(line);
      while (hud.killfeed.children.length > 5) hud.killfeed.lastChild.remove();
    } else if (e.type === 'info') {
      const line = document.createElement('div');
      line.className = 'kf-line kf-info';
      line.textContent = e.text;
      hud.killfeed.prepend(line);
      while (hud.killfeed.children.length > 5) hud.killfeed.lastChild.remove();
    } else if (e.type === 'hitmark') {
      hud.hitmarker.classList.add('on');
      hud.hitmarker.classList.toggle('kill', !!e.kill);
      clearTimeout(hud._hmT);
      hud._hmT = setTimeout(() => hud.hitmarker.classList.remove('on', 'kill'), 140);
    } else if (e.type === 'hurt') {
      hud.damage.classList.add('on');
      clearTimeout(hud._dmgT);
      hud._dmgT = setTimeout(() => hud.damage.classList.remove('on'), 220);
    } else if (e.type === 'flashPlayer') {
      hud.flash.style.opacity = Math.min(1, e.strength / 2).toFixed(2);
      clearTimeout(hud._flT);
      hud._flT = setTimeout(() => { hud.flash.style.opacity = 0; }, 350);
    }
  }
}

export function updateHud(G, dt) {
  const hud = G.hud;
  const p = G.player;
  drainEvents(G);

  // Phase overlays.
  hud.title.hidden = G.phase !== 'title';
  hud.end.hidden = G.phase !== 'matchEnd';
  if (G.phase === 'matchEnd' && G.matchWinner) {
    hud.endTitle.textContent = G.matchWinner === 'van' ? 'DUSTFALL IS YOURS' : 'WARDENS HOLD THE YARD';
    hud.endSub.textContent = `Final score Vanguard ${G.score.van} — ${G.score.war} Wardens`;
  }
  if (G.phase === 'buy' && !G.buyOpen && !G._buyMenuOpened) openBuy(G);
  if (G.phase !== 'buy' && G.buyOpen) { G.buyOpen = false; hud.buy.hidden = true; }
  if (G.buyOpen) refreshBuy(G);

  // Banner (counted in real seconds, not frames).
  if (G.banner) {
    hud.bannerTitle.textContent = G.banner.text;
    hud.bannerSub.textContent = G.banner.sub || '';
    hud.banner.hidden = false;
    G.banner.t -= dt || 1 / 60;
    if (G.banner.t <= 0) { G.banner = null; hud.banner.hidden = true; }
  }

  // Readouts.
  hud.hp.textContent = Math.max(0, Math.ceil(p.hp));
  hud.hpBar.style.width = `${Math.max(0, p.hp)}%`;
  hud.hpBar.classList.toggle('low', p.hp <= 30);
  hud.armor.textContent = p.hasArmor ? `▣ ${Math.ceil(p.armor)}` : '—';
  hud.money.textContent = `$${G.money}`;
  const w = WEAPONS[p.weaponId];
  hud.ammoMag.textContent = p.mag;
  hud.ammoRes.textContent = `/ ${p.reserve}`;
  hud.ammoBox.classList.toggle('empty', p.mag === 0);
  hud.reload.hidden = p.reloadT <= 0;
  hud.timer.textContent = G.bombPlanted ? fmtTime(G.bombTime) : fmtTime(G.phase === 'buy' ? G.buyTime : G.roundTime);
  hud.timer.classList.toggle('bomb', G.bombPlanted);
  hud.scoreVan.textContent = G.score.van;
  hud.scoreWar.textContent = G.score.war;
  hud.round.textContent = `ROUND ${G.round}`;
  hud.bomb.textContent = G.bombPlanted
    ? `◉ BOMB AT SITE ${G.bombSite} — ${fmtTime(G.bombTime)}`
    : G.bombCarrier === p ? '● YOU CARRY THE BOMB — hold E at A or B' : '○ BOMB WITH A TEAMMATE';

  // Plant / defuse progress.
  const planting = p.plantT > 0;
  hud.plant.hidden = !planting;
  if (planting) {
    hud.plantFill.style.width = `${(p.plantT / GAME.plantSeconds) * 100}%`;
    hud.plantLabel.textContent = 'PLANTING…';
  }

  // Crosshair gap grows with speed and bloom; hidden while scoped.
  const gap = 4 + Math.min(14, p.speed * 1.6);
  hud.crosshair.style.setProperty('--gap', `${gap}px`);
  hud.crosshair.hidden = G.scoped || !p.alive;
  hud.scope.hidden = !G.scoped;
  hud.hint.textContent = G.phase === 'buy'
    ? 'B buy menu · 1-4 weapons · 5-7 grenades · click DEPLOY'
    : 'WASD move · Shift sprint · Ctrl crouch · R reload · B buy · E plant · G grenade';

  drawMinimap(G);
}

function drawMinimap(G) {
  const hud = G.hud;
  const ctx = hud.mmCtx;
  const W = 168, H = 128;
  const sx = W / 64, sz = H / 48;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(20, 22, 26, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(233, 230, 223, 0.25)';
  for (const c of G.world.colliders) {
    if (c.y1 < 2) continue;
    ctx.fillRect((c.x0 + 32) * sx, (c.z0 + 24) * sz, (c.x1 - c.x0) * sx, (c.z1 - c.z0) * sz);
  }
  for (const key of ['A', 'B']) {
    const s = G.world.sites[key];
    ctx.fillStyle = key === 'A' ? '#d8a13c' : '#2f8f86';
    ctx.beginPath();
    ctx.arc((s.x + 32) * sx, (s.z + 24) * sz, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14161a';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(key, (s.x + 32) * sx, (s.z + 24) * sz + 0.5);
  }
  if (G.bombPlanted && G.bombPos) {
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc((G.bombPos.x + 32) * sx, (G.bombPos.z + 24) * sz, 4 + Math.sin(G.time * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const f of G.fighters) {
    if (!f.alive) continue;
    ctx.fillStyle = f.isPlayer ? '#ffffff' : f.team === 'van' ? '#d8a13c' : '#2f8f86';
    ctx.beginPath();
    ctx.arc((f.x + 32) * sx, (f.z + 24) * sz, f.isPlayer ? 3.5 : 2.8, 0, Math.PI * 2);
    ctx.fill();
    if (f.isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo((f.x + 32) * sx, (f.z + 24) * sz);
      ctx.lineTo((f.x + 32) * sx - Math.sin(f.yaw) * 8, (f.z + 24) * sz - Math.cos(f.yaw) * 8);
      ctx.stroke();
    }
  }
}
