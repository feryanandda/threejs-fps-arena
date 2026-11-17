# DUSTFALL — a 5v5 tactical FPS

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/feryanandda/threejs-fps-arena/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/feryanandda/threejs-fps-arena/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

DUSTFALL is an original round-based tactical first-person shooter that runs
offline in the browser on three.js 0.187.0. You and four Vanguard bots push
a dusty walled courtyard against five Warden bots: plant the bomb at Site A
or Site B, or wipe the defenders out. First to 7 rounds takes the yard.

## The game

- **5v5 rounds** — buy phase (15 s), live round (100 s), bomb timer (35 s),
  first to 7. Rounds end on elimination, detonation, defusal, or the clock.
- **Economy** — $800 to start, $300 a kill, $300 a plant, $3,250 a round win,
  $1,900 a round loss (plus a loss-streak bonus). Spend it in the buy menu
  (B): pistol, SMG, rifle, sniper, Kevlar, and HE / flash / smoke grenades.
- **Gunplay** — hitscan fire with headshots paying double, spread that
  grows with movement and with every shot in a burst, recoil, reloads, and
  a sniper scope. Stopping to aim pays.
- **Bots** — waypoint routes with rusher/holder roles, a vision cone plus
  line of sight, hearing for gunshots, burst fire with distance-scaled aim
  error, and the objective jobs: attackers plant, defenders defuse.
- **The map** — Dustfall Yard, an original 64 × 48 m courtyard: two
  bombsites, a mid lane past a dry fountain, two side lanes, crates and
  walls that break the sightlines. Warm dusk light, sand and terracotta.
- **HUD** — health and armour, money, ammunition, round timer and score,
  killfeed, hitmarker, plant progress, bomb status, and a live minimap.
- **Sound** — every effect is synthesised with WebAudio; no audio files.

## Run it

```sh
node serve.ts   # then open http://localhost:8080 — or serve game/ with any static server
```

Hand in with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## Controls

WASD move · mouse look · click fire · Shift sprint · Ctrl crouch · Space
jump · R reload · 1–4 weapons · 5–7 grenades · B buy menu · E plant the
bomb (hold) · right-click scope (sniper).

`?demo=1` runs the autopilot (title attract mode and the maker's
screenshots); `?shot=menu|buy|fight|plant|end` stages a scene for a
screenshot.

---

<sub>Entered on [make.fun](https://make.fun/?ref=heyyw288&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
