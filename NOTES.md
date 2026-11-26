# SKYFERRY — build notes

## What it is

A complete 3D flight game in static files: a chase-cam courier plane
(the Kite-9, built from primitives) over a seeded island archipelago,
with six missions that each play differently — rings, cargo drops, a
graded short-strip landing, a storm crossing, a night mail run, and a
rescue pickup. The cockpit shows twelve live systems. Audio is
synthesized at run time (engine, wind, chimes); there are no audio files.

## How it is built

- `game/src/main.js` — boot, state machine (title / playing / paused /
  over), fixed-step loop, `?seed=` and `?shot=` handling.
- `game/src/config.js` — every tuned number and all mission data.
- `game/src/random.js` — mulberry32 + value noise; the same seed always
  builds the same islands.
- `game/src/input.js` — keyboard state, edge-triggered actions.
- `game/src/aircraft.js` — the plane mesh and the arcade flight model
  (lift, stall, banked turns, drag, fuel, ground effect, landings).
- `game/src/terrain.js` — the height function (shared by mesh and
  physics, so what you see is what you hit), ocean, trees, runways,
  rings, lighthouse, smoke, windsock, clouds.
- `game/src/weather.js` — trade wind, gusts, the storm front, shear.
- `game/src/missions.js` — the six sorties: objectives, scoring, landing
  grades.
- `game/src/hud.js` — the twelve-system glass cockpit (DOM + canvas).
- `game/src/audio.js` — WebAudio synth, silent until first interaction.
- `game/src/render.js` — renderer, chase camera, sky dome, lighting.
- `game/src/world.js` — scene assembly; steps plane, mission and crates.
- `game/src/shots.js` — deterministic screenshot staging: an autopilot
  plays the real rules forward from a fresh world, so each screenshot is
  a frame of real play at a fixed seed.
- `game/vendor/three.module.min.js` — three.js r160, vendored.
- `game/fonts/rajdhani-bold.ttf` — Rajdhani Bold, vendored.

## Screenshots

Four real renders of the game's own code, staged by `shots.js` at seed 7:

1. `1-cover.jpg` — ring run, mid-course, next ring ahead, full HUD.
2. `2-cargo.jpg` — cargo drop over the beach circle, crate falling.
3. `3-landing.jpg` — final approach to the short north strip, gear down.
4. `4-night.jpg` — night mail run toward the lighthouse beam.

## Honest weaknesses

- The flight model is arcade, not a simulator: no torque, no adverse
  yaw, no crosswind component on the ground roll, and the stall is a
  gentle sink rather than a wing drop.
- The terrain is a heightfield, not a hand-built map: coasts are smooth
  and the islands share one visual language; there are no buildings,
  roads or moving boats.
- The autopilot that stages screenshots flies well but is not a player:
  it never shows off, so the frames are competent rather than dramatic.
- Storm turbulence is a shake applied to the controls plus airframe
  damage at speed; it does not model microbursts or windshear on final.
- Landing grades are heuristics (centreline, sink rate, speed), not a
  real flight-test rubric.
- Audio needs a first click or keypress (browser autoplay policy) and is
  silent in the screenshots.
- No multiplayer, no save system beyond the mission list; best scores
  are not persisted.

## Bugs found by the screenshot pass (fixed 26 Nov 2026)

- Takeoff rotation read the pitch *state*, which the ground loop damps
  10% per tick, so rotation was marginal: the plane drove off the strip
  and bounced along the hillside, paying the rough-field penalty each
  bounce. Rotation now reads the pilot's pitch *input* and requires
  0.4 s of continuous ground roll, so a touchdown cannot bounce back
  up the same tick.
- The ring course used to climb straight over the main island's peak
  (150 m, later 95 m) right after takeoff, which the climb could not
  outrun. The course now climbs out east over the sea (the takeoff
  heading), runs up the east coast, and the main peak is 95 m.
- The north strip sat behind its island's peak from the west approach,
  so the runway was hidden in the landing frame. It moved to the
  island's west shore, where the approach sees it against the island.
- The stall warning used a fixed 30 m/s threshold and warned at 54 kt
  with full flaps; it is now flap-dependent (26 / 28 / 31 m/s).
- The chase camera sat 13 m back, so the 11 m plane filled the frame;
  it now sits 22 m back.
- The cargo drop zone sat 350 m past the south shore, in the sea, with
  its ring painted under the water — and the staging dropped fast and
  high, so the crate sailed 200 m past the mark. The zone moved onto
  the south beach and the staging now flies slow and low (flaps full,
  26 m/s, 50 m) and releases ~110 m short, so the crate's carry puts
  it on the mark.
