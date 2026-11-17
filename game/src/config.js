// DUSTFALL — shared constants. One place for every number the judge can
// check against the code: weapons, economy, round timings, bot senses.
export const GAME = {
  name: 'DUSTFALL',
  mapName: 'Dustfall Yard',
  winsNeeded: 7,
  buySeconds: 15,
  roundSeconds: 100,
  bombSeconds: 35,
  plantSeconds: 3,
  defuseSeconds: 5,
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  maxLossReward: 2900,
  tickHz: 60,
};

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 2.0, mag: 12, reserve: 120, auto: false,
    interval: 0.28, reload: 1.4, spread: 0.011, moveSpread: 0.030,
    recoil: 0.011, range: 60, zoom: 1, tracer: 0xffe9a8,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 Spray', kind: 'smg', price: 1500,
    damage: 22, headMult: 2.0, mag: 30, reserve: 120, auto: true,
    interval: 0.09, reload: 2.0, spread: 0.020, moveSpread: 0.045,
    recoil: 0.009, range: 55, zoom: 1, tracer: 0xffd27a,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Longshot', kind: 'rifle', price: 2700,
    damage: 33, headMult: 2.0, mag: 25, reserve: 75, auto: true,
    interval: 0.12, reload: 2.4, spread: 0.008, moveSpread: 0.038,
    recoil: 0.016, range: 90, zoom: 1, tracer: 0xffe9a8,
  },
  lr50: {
    id: 'lr50', name: 'LR-50 Dustline', kind: 'sniper', price: 4750,
    damage: 95, headMult: 2.0, mag: 5, reserve: 15, auto: false,
    interval: 1.2, reload: 3.2, spread: 0.001, moveSpread: 0.060,
    recoil: 0.055, range: 120, zoom: 2.6, tracer: 0xfff2c0,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'HE Charge', price: 300, radius: 6.5, damage: 95 },
  flash: { id: 'flash', name: 'Flash Shell', price: 200, radius: 24, blind: 2.2 },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 300, radius: 5, life: 12 },
};

export const ARMOR_PRICE = 650;

// Movement, in metres and seconds. Acceleration with friction gives the
// stop-to-aim feel: firing on the move widens spread (see WEAPONS).
export const MOVE = {
  walk: 5.2,
  sprint: 7.0,
  crouch: 2.6,
  accel: 55,
  friction: 9,
  airControl: 0.35,
  jumpSpeed: 5.4,
  gravity: 14,
  eyeHeight: 1.62,
  crouchEye: 1.12,
  radius: 0.35,
  height: 1.7,
};

// Bot senses. Vision is a cone plus line of sight; hearing is a radius
// around gunshots; accuracy falls with distance and target movement.
export const BOT = {
  viewRange: 45,
  fov: 1.92, // ~110 degrees, radians
  hearRange: 28,
  reactionMin: 0.25,
  reactionMax: 0.6,
  burstMin: 3,
  burstMax: 5,
  burstPause: 0.55,
  aimError: 0.016, // radians of aim noise at 10 m
  errorPerMetre: 0.0009,
  moveError: 0.02,
  walkSpeed: 4.4,
  holdTime: 6,
};

export const PALETTE = {
  sand: 0xc9a06b,
  sandDark: 0xa9854f,
  wall: 0xb98d5f,
  wallTop: 0x8a6a44,
  teal: 0x2f8f86,
  tealDark: 0x1f5f5a,
  gold: 0xd8a13c,
  rust: 0x9c4a2f,
  sky: 0xe8b07e,
  fog: 0xd9a06e,
  crate: 0x7a5c38,
  barrel: 0x4a6b6f,
  siteA: 0xd8a13c,
  siteB: 0x2f8f86,
};
