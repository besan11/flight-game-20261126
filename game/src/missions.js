// SKYFERRY — the six missions. One file, one job: what "done" means
// for each sortie, the objectives the HUD shows, and the score.
// Missions never touch the renderer; they read the flight state and
// the world and report events the game loop turns into feedback.

import * as THREE from 'three';
import { DROP_ZONE, HIKER, LIGHTHOUSE, MISSIONS, RING_COURSE, RING_RADIUS, STRIPS } from './config.js';
import { stripUnder } from './aircraft.js';

export const FAR_BEACON = { x: 620, z: -1760 };
export const MAIL_RING = { x: LIGHTHOUSE.x, y: 110, z: LIGHTHOUSE.z, radius: 22 };

/** Fresh mission runtime state for mission `index`. */
export function freshMission(index) {
  const def = MISSIONS[index];
  return {
    index,
    def,
    timeLeft: def.par,
    elapsed: 0,
    score: 0,
    finished: false,
    failed: false,
    message: def.briefing,
    ringsPassed: 0,
    cratesLeft: 3,
    cratesScored: 0,
    cratesDropped: 0,
    pickedUp: false,
    mailDone: false,
    stormDone: false,
    landingGrade: null,
    objectives: objectivesFor(index),
  };
}

function objectivesFor(index) {
  switch (index) {
    case 0:
      return [{ id: 'rings', text: 'Fly the 8 rings in order', done: false }];
    case 1:
      return [{ id: 'crates', text: 'Drop 3 crates on the beach circle', done: false }];
    case 2:
      return [
        { id: 'takeoff', text: 'Take off from the main strip', done: false },
        { id: 'land', text: 'Land on the short north strip', done: false },
      ];
    case 3:
      return [{ id: 'cross', text: 'Cross the storm, reach the far beacon', done: false }];
    case 4:
      return [
        { id: 'mail', text: 'Fly the mail ring over the lighthouse', done: false },
        { id: 'home', text: 'Land back on the main strip', done: false },
      ];
    case 5:
      return [
        { id: 'pickup', text: 'Pass low over the hiker smoke', done: false },
        { id: 'home', text: 'Land back on the main strip', done: false },
      ];
    default:
      return [];
  }
}

function finish(mission, bonus, message) {
  mission.finished = true;
  mission.score += bonus;
  mission.message = message;
}

function gradeLanding(plane, strip) {
  const centreOffset = Math.abs(plane.pos.z - strip.z);
  const sink = Math.max(0, -plane.vs);
  const speedKt = plane.speed * 1.94384;
  let grade = 100;
  grade -= Math.min(40, centreOffset * 1.6);
  grade -= Math.min(30, Math.max(0, sink - 2) * 8);
  grade -= Math.min(20, Math.max(0, speedKt - 70) * 0.8);
  grade = Math.max(20, Math.round(grade));
  const label = grade >= 90 ? 'GREASED IT' : grade >= 70 ? 'SOLID LANDING' : grade >= 50 ? 'ROUGH BUT DOWN' : 'WALLOPED ON';
  return { grade, label, centreOffset, sink, speedKt };
}

/**
 * Step the active mission. `world` exposes plane, crates, rings and
 * events; returns an array of event strings for sound + HUD feedback.
 */
export function stepMission(mission, world, dt) {
  const events = [];
  const plane = world.plane;
  if (mission.finished || mission.failed) return events;
  mission.elapsed += dt;
  mission.timeLeft = Math.max(0, mission.def.par - mission.elapsed);
  if (mission.timeLeft <= 0) {
    mission.failed = true;
    mission.message = 'Out of time — the sortie is over. Press T to fly it again.';
    events.push('fail');
    return events;
  }

  switch (mission.index) {
    case 0: {
      const target = RING_COURSE[mission.ringsPassed];
      if (target) {
        const d = Math.hypot(plane.pos.x - target[0], plane.pos.y - target[1], plane.pos.z - target[2]);
        if (d < RING_RADIUS) {
          mission.ringsPassed += 1;
          mission.score += 100;
          events.push('ring');
          mission.message = `Ring ${mission.ringsPassed} of 8 — ${8 - mission.ringsPassed} to go.`;
          if (mission.ringsPassed >= 8) {
            const bonus = Math.round(mission.timeLeft) * 2;
            finish(mission, bonus, `Course complete! ${mission.score} points + ${bonus} time bonus. Press T for the next mission.`);
            events.push('finish');
          }
        }
      }
      break;
    }
    case 1: {
      if (mission.cratesDropped >= 3 && world.crates.length === 0 && !mission.finished) {
        const bonus = Math.round(mission.timeLeft) * 2;
        finish(mission, bonus, `All crates down — ${mission.cratesScored} on target. ${mission.score} points + ${bonus} time bonus.`);
        events.push('finish');
      }
      break;
    }
    case 2: {
      if (!mission.objectives[0].done && !plane.onGround && plane.speed > 30) {
        mission.objectives[0].done = true;
        mission.score += 100;
        mission.message = 'Airborne. Fly the circuit to the north strip — gear down, flaps full.';
        events.push('objective');
      }
      if (plane.landed && mission.objectives[0].done) {
        const strip = stripUnder(plane.pos.x, plane.pos.z);
        if (strip === STRIPS.north) {
          const g = gradeLanding(plane, strip);
          mission.landingGrade = g;
          mission.objectives[1].done = true;
          const bonus = Math.round(g.grade * 5 + mission.timeLeft);
          finish(mission, bonus, `${g.label} — grade ${g.grade}/100. ${mission.score} points + ${bonus} bonus.`);
          events.push('finish');
        } else if (strip === STRIPS.main) {
          mission.message = 'That is the main strip, not the north one — go around and try the short strip.';
        }
      }
      break;
    }
    case 3: {
      const d = Math.hypot(plane.pos.x - FAR_BEACON.x, plane.pos.z - FAR_BEACON.z);
      if (d < 80 && !mission.stormDone) {
        mission.stormDone = true;
        const bonus = Math.round(mission.timeLeft) * 2;
        finish(mission, bonus, `Through the front! ${mission.score} points + ${bonus} time bonus.`);
        events.push('finish');
      }
      break;
    }
    case 4: {
      if (!mission.mailDone) {
        const d = Math.hypot(plane.pos.x - MAIL_RING.x, plane.pos.y - MAIL_RING.y, plane.pos.z - MAIL_RING.z);
        if (d < MAIL_RING.radius) {
          mission.mailDone = true;
          mission.objectives[0].done = true;
          mission.score += 400;
          mission.message = 'Mail delivered over the lighthouse. Now come home and land on the main strip.';
          events.push('ring');
        }
      } else if (plane.landed) {
        const strip = stripUnder(plane.pos.x, plane.pos.z);
        if (strip === STRIPS.main) {
          mission.objectives[1].done = true;
          const bonus = Math.round(mission.timeLeft) * 2;
          finish(mission, bonus, `Home safe with the mail run done. ${mission.score} points + ${bonus} time bonus.`);
          events.push('finish');
        }
      }
      break;
    }
    case 5: {
      if (!mission.pickedUp) {
        const dx = plane.pos.x - HIKER.x;
        const dz = plane.pos.z - HIKER.z;
        const agl = plane.pos.y - world.heightAt(HIKER.x, HIKER.z);
        if (Math.hypot(dx, dz) < 30 && agl < 55) {
          mission.pickedUp = true;
          mission.objectives[0].done = true;
          mission.score += 500;
          mission.message = 'Hiker aboard! Now land back on the main strip — gently, you have a passenger.';
          events.push('pickup');
        }
      } else if (plane.landed) {
        const strip = stripUnder(plane.pos.x, plane.pos.z);
        if (strip === STRIPS.main) {
          mission.objectives[1].done = true;
          const g = gradeLanding(plane, strip);
          mission.landingGrade = g;
          const bonus = Math.round(g.grade * 4 + mission.timeLeft);
          finish(mission, bonus, `Rescue complete — ${g.label.toLowerCase()}. ${mission.score} points + ${bonus} bonus.`);
          events.push('finish');
        }
      }
      break;
    }
    default:
      break;
  }

  // Storm damage: hard turbulence at speed hurts the airframe.
  if (world.weather.stormOn && world.weather.insideStorm(plane.pos.x, plane.pos.z, world.time)) {
    const w = world.weather.windAt(plane.pos.x, plane.pos.z, world.time);
    if (w.turbulence > 0.6 && plane.speed > 50) {
      plane.integrity = Math.max(0, plane.integrity - w.turbulence * dt * 3.2);
      if (plane.integrity <= 0 && !plane.crashed) {
        plane.crashed = true;
        plane.crashCause = 'Airframe overstressed in the storm';
        events.push('crash');
      }
    }
  }
  return events;
}

/** Score a landed crate: distance from the drop-zone centre decides. */
export function scoreCrate(mission, crate) {
  const d = Math.hypot(crate.pos.x - DROP_ZONE.x, crate.pos.z - DROP_ZONE.z);
  let pts = 0;
  let note = '';
  if (d < 12) {
    pts = 300;
    note = 'Dead centre — 300 points!';
  } else if (d < DROP_ZONE.radius) {
    pts = 180;
    note = 'On target — 180 points.';
  } else if (d < DROP_ZONE.radius * 2.2) {
    pts = 60;
    note = 'Close, on the sand — 60 points.';
  } else {
    note = 'In the drink — no points.';
  }
  mission.score += pts;
  if (d < DROP_ZONE.radius) mission.cratesScored += 1;
  mission.message = `Crate ${mission.cratesDropped} of 3: ${note}`;
  return pts;
}
