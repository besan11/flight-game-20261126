// SKYFERRY — boot and the game loop. One file, one job: read the URL
// (?seed=, ?shot=), own the title / playing / paused / over state
// machine, and run the fixed-step simulation with the render loop.

import { GameRenderer } from './render.js';
import { World } from './world.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { input } from './input.js';
import { stageShot } from './shots.js';
import { MISSIONS, WORLD } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') ?? '', 10) || WORLD.seedDefault;
const shotName = params.get('shot');
const shotMode = shotName !== null;

const canvas = document.getElementById('game');
const renderer = new GameRenderer(canvas);
const world = new World(seed, renderer.scene);
const sound = new SoundEngine();
const hud = new Hud(document, {
  onSelectMission: (i) => startMission(i),
});

let state = 'title'; // title | playing | paused | over
let last = performance.now();
let shotStaged = false;

input.install();

function startMission(index) {
  sound.ensure();
  sound.click();
  world.reset(index);
  hud.hideOverlays();
  hud.setMessage(world.mission.def.briefing);
  state = 'playing';
}

function endFlight(title, lines, hint) {
  state = 'over';
  hud.showEnd(title, lines, hint);
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev === 'ring') sound.ring();
    else if (ev === 'objective' || ev === 'crate' || ev === 'pickup') sound.objective();
    else if (ev === 'finish') sound.finish();
    else if (ev === 'fail') sound.fail();
    else if (ev === 'crash') sound.crash();
  }
  const m = world.mission;
  if (m.finished) {
    endFlight('SORTIE COMPLETE', [
      `${m.def.name} — ${m.score} points`,
      m.message,
      'Press T to fly it again, or pick another mission from the title screen.',
    ], 'Press T to refly · Click a mission to change sortie');
  } else if (m.failed) {
    sound.fail();
    endFlight('SORTIE FAILED', [m.def.name, m.message], 'Press T to try again');
  } else if (world.plane.crashed) {
    endFlight('CRASHED', [
      world.plane.crashCause || 'The Kite-9 is down.',
      `Score kept: ${m.score} points.`,
    ], 'Press T to fly again');
  } else if (world.plane.fuel <= 0 && !world.plane.engineOn) {
    hud.setMessage('Fuel empty — engine out. Find a strip and glide her in.');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, Math.max(0.0001, (now - last) / 1000));
  last = now;

  if (shotMode) {
    if (!shotStaged) {
      stageShot(shotName, world);
      hud.hideOverlays();
      hud.setMessage(world.mission.message);
      shotStaged = true;
    }
    hud.update(world);
    renderer.render(world, 0.016);
    return;
  }

  if (state === 'title') {
    // Idle over the parked plane while the menu shows; keep the glass live.
    hud.update(world);
    renderer.render(world, dt);
    return;
  }

  if (input.pausePressed()) {
    if (state === 'playing') {
      state = 'paused';
      hud.showPause();
    } else if (state === 'paused') {
      state = 'playing';
      hud.hideOverlays();
    }
  }
  if (input.restartPressed() && state !== 'title') {
    startMission(world.mission.index);
    input.consume();
    return;
  }
  if (state === 'paused') {
    renderer.render(world, dt);
    input.consume();
    return;
  }
  if (state === 'over') {
    if (input.actionPressed()) {
      hud.showTitle();
      state = 'title';
    }
    renderer.render(world, dt);
    input.consume();
    return;
  }

  // Playing: read controls, step the world, sound the events.
  const axes = input.axes();
  const simInput = {
    pitch: axes.pitch,
    roll: axes.roll,
    throttleDelta: input.throttleDelta(),
    brake: input.brakeHeld(),
  };
  if (input.flapsPressed()) {
    world.plane.flaps = (world.plane.flaps + 1) % 3;
    sound.click();
  }
  if (input.gearPressed()) {
    world.plane.gearDown = !world.plane.gearDown;
    sound.click();
  }
  if (input.actionPressed()) {
    if (world.handleAction()) sound.objective();
  }
  const events = world.step(dt, simInput);
  handleEvents(events);
  sound.setFlight(world.plane.throttle, world.plane.speed, world.plane.engineOn);
  hud.update(world);
  renderer.render(world, dt);
  input.consume();
}

// Number keys pick a mission from the title screen.
window.addEventListener('keydown', (event) => {
  if (state !== 'title') return;
  const n = Number.parseInt(event.key, 10);
  if (n >= 1 && n <= MISSIONS.length) startMission(n - 1);
});

hud.showTitle();
hud.setMessage('Pick a sortie. Throttle with Shift / Ctrl, steer with the arrow keys or WASD.');
requestAnimationFrame(frame);
