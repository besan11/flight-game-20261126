// SKYFERRY — screenshot scenes behind ?shot=cover|cargo|landing|night.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot (bank toward the
// target, pitch for altitude, throttle for speed), so the frame is what
// real play looks like and the same seed always gives the same frame.
// The autopilot is terrain-aware: it never targets an altitude below
// the ground ahead plus clearance, so it flies over the peaks instead
// of scraping along them.

import { DROP_ZONE, LIGHTHOUSE, RING_COURSE } from './config.js';
import { MAIL_RING } from './missions.js';
import { wrapAngle } from './aircraft.js';

const STEP = 1 / 60;

/** Steer toward a point at a target altitude and speed. */
function autopilotTo(world, tx, ty, tz, targetSpeed, maxBank = 0.6) {
  const p = world.plane;
  const dx = tx - p.pos.x;
  const dz = tz - p.pos.z;
  const dist = Math.hypot(dx, dz);
  // Terrain clearance: sample the ground ahead along the bearing and
  // never target an altitude below it plus 45 m.
  let clearance = ty;
  if (dist > 1) {
    const step = Math.max(60, dist / 6);
    for (let d = 60; d < Math.min(dist, 900); d += step) {
      const sx = p.pos.x + (dx / dist) * d;
      const sz = p.pos.z + (dz / dist) * d;
      clearance = Math.max(clearance, world.heightAt(sx, sz) + 45);
    }
  }
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapAngle(desiredHeading - p.heading);
  const roll = Math.max(-maxBank, Math.min(maxBank, headingErr * 1.2));
  const altErr = clearance - p.pos.y;
  const desiredPitch = Math.max(-0.3, Math.min(0.3, altErr * 0.012));
  const pitch = Math.max(-1, Math.min(1, (desiredPitch - p.pitch) * 2.2));
  let throttleDelta = 0;
  if (p.speed < targetSpeed - 3) throttleDelta = 1;
  else if (p.speed > targetSpeed + 3) throttleDelta = -1;
  return { pitch, roll, throttleDelta, brake: false };
}

function runSteps(world, seconds, steer) {
  runUntil(world, seconds, steer, null);
}

/** Step forward until `stopWhen` is true or `maxSeconds` elapse. */
function runUntil(world, maxSeconds, steer, stopWhen) {
  const steps = Math.round(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.plane.crashed) break;
    if (stopWhen && stopWhen(world)) break;
    world.step(STEP, steer(world));
  }
}

/** Stage the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  if (name === 'cargo') {
    world.reset(1);
    world.plane.throttle = 0.8;
    world.plane.flaps = 2; // slow flight for the drop: stall 23 m/s
    // Fly in slow and low; drop the moment we are ~85 m short of the
    // mark (the crate keeps 70% of our speed and carries ~80 m), then
    // hold the shot 1.0 s later: the crate is still just below the
    // plane, above the briefing panel, with the beach circle ahead.
    let droppedAt = -1;
    const zoneAlt = world.heightAt(DROP_ZONE.x, DROP_ZONE.z) + 50;
    runUntil(
      world,
      60,
      (w) => {
        const p = w.plane;
        const d = Math.hypot(p.pos.x - DROP_ZONE.x, p.pos.z - DROP_ZONE.z);
        if (droppedAt < 0 && d < 85) {
          w.handleAction();
          droppedAt = w.time;
        }
        return autopilotTo(w, DROP_ZONE.x, zoneAlt, DROP_ZONE.z, 28, 0.5);
      },
      (w) => droppedAt >= 0 && w.time - droppedAt > 1.0,
    );
    return { screen: 'play' };
  }
  if (name === 'landing') {
    world.reset(2);
    world.plane.throttle = 1;
    // Take off, climb out, then join a long final from the west, over
    // the water, so the strip lies ahead down the approach.
    runSteps(world, 14, () => ({ pitch: 0.55, roll: 0, throttleDelta: 1, brake: false }));
    runSteps(world, 50, (w) => autopilotTo(w, -400, 160, -1380, 44, 0.6));
    world.plane.gearDown = true;
    world.plane.flaps = 2;
    runSteps(world, 20, (w) => autopilotTo(w, 350, w.heightAt(350, -1380) + 55, -1380, 30, 0.5));
    return { screen: 'play' };
  }
  if (name === 'night') {
    world.reset(4);
    world.plane.throttle = 0.85;
    // Fly at the mail ring and stop ~350 m out, so the ring, the
    // lighthouse and its beam all sit ahead in the frame.
    runUntil(
      world,
      95,
      (w) => autopilotTo(w, MAIL_RING.x, MAIL_RING.y, MAIL_RING.z, 42, 0.6),
      (w) =>
        Math.hypot(w.plane.pos.x - MAIL_RING.x, w.plane.pos.y - MAIL_RING.y, w.plane.pos.z - MAIL_RING.z) < 350,
    );
    return { screen: 'play' };
  }
  // Default: cover — the ring run, mid-course, a ring dead ahead.
  world.reset(0);
  world.plane.throttle = 0.85;
  runSteps(world, 60, (w) => {
    const target = RING_COURSE[Math.min(w.mission.ringsPassed, 7)];
    return autopilotTo(w, target[0], target[1], target[2], 46, 0.6);
  });
  return { screen: 'play' };
}
