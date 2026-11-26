// SKYFERRY — the aeroplane. One file, one job: the Kite-9 courier
// plane (built from primitives, an original design) and the arcade
// flight model that moves it: lift, stall, banked turns, drag, fuel
// burn, wind, ground effect, landings and crashes.

import * as THREE from 'three';
import { PLANE, STRIPS, WORLD } from './config.js';

/** Forward unit vector from heading (rad, compass) and pitch (rad). */
export function forwardFrom(heading, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp);
}

/** Build the Kite-9 courier plane from primitives. Nose points -Z. */
export function buildPlaneMesh() {
  const plane = new THREE.Group();
  plane.name = 'kite-9';
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a1c, roughness: 0.55 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x1f7a6d, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x20344a, roughness: 0.15, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 });

  // Fuselage: a tapered body, nose cone forward, tail cone aft.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.4, 10), cream);
  body.rotation.x = Math.PI / 2;
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 10), orange);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.5;
  plane.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 10), teal);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 3.6;
  plane.add(tail);

  // Canopy: a glass bubble over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.75, 1.6);
  canopy.position.set(0, 0.55, -1.2);
  plane.add(canopy);

  // Wings: one low wing with a slight dihedral, orange with cream tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 1.9), orange);
  wing.position.set(0, -0.25, -0.3);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.9), cream);
    tip.position.set(side * 5.3, -0.18, -0.3);
    tip.rotation.z = side * 0.06;
    plane.add(tip);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshStandardMaterial({ color: side < 0 ? 0xff2020 : 0x20ff40, emissive: side < 0 ? 0xff2020 : 0x20ff40, emissiveIntensity: 1.6 }),
    );
    light.position.set(side * 5.8, -0.18, -0.3);
    plane.add(light);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), teal);
  tailplane.position.set(0, 0.15, 3.9);
  plane.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), teal);
  fin.position.set(0, 0.8, 3.9);
  plane.add(fin);

  // Propeller: hub + two blades, spun by the render loop.
  const prop = new THREE.Group();
  prop.name = 'propeller';
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.1), dark);
    blade.rotation.z = a;
    blade.position.z = -0.2;
    prop.add(blade);
  }
  prop.position.z = -4.5;
  plane.add(prop);
  plane.userData.propeller = prop;

  // Landing gear: three struts with wheels, hidden when retracted.
  const gear = new THREE.Group();
  gear.name = 'gear';
  for (const [x, z] of [[-1.1, -0.6], [1.1, -0.6], [0, 2.6]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    strut.position.set(x, -1.0, z);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -1.55, z);
    gear.add(wheel);
  }
  plane.add(gear);
  plane.userData.gear = gear;

  plane.traverse((child) => {
    if (child.isMesh) child.castShadow = false;
  });
  return plane;
}

/** Fresh flight state: parked on the main strip, engine idling. */
export function freshFlightState() {
  const strip = STRIPS.main;
  return {
    pos: new THREE.Vector3(strip.x - strip.length / 2 + 30, strip.height + 1.8, strip.z),
    heading: Math.PI / 2, // facing east, down the strip
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0.12,
    flaps: 0,
    gearDown: true,
    fuel: 1,
    integrity: 100,
    vs: 0,
    gForce: 1,
    engineOn: true,
    onGround: true,
    landed: false,
    groundTime: 0, // continuous seconds on the ground (anti-bounce guard)
    crashed: false,
    crashCause: '',
    propAngle: 0,
  };
}

/**
 * Step the flight model one tick. `input` is {pitch, roll, throttleDelta,
 * brake}; `wind` is the weather wind vector; `heightAt` is the terrain.
 * Mutates and returns the flight state.
 */
export function stepFlight(s, input, wind, heightAt, dt) {
  const groundH = heightAt(s.pos.x, s.pos.z);
  const stall = s.flaps === 2 ? PLANE.stallSpeedFlaps : s.flaps === 1 ? PLANE.stallSpeed - 2 : PLANE.stallSpeed;

  // --- Throttle and fuel. ---
  s.throttle = Math.min(1, Math.max(0, s.throttle + input.throttleDelta * 0.55 * dt));
  const burn = (PLANE.fuelBurnCruise + (PLANE.fuelBurnFull - PLANE.fuelBurnCruise) * s.throttle) * dt;
  s.fuel = Math.max(0, s.fuel - burn);
  if (s.fuel <= 0) {
    s.engineOn = false;
    s.throttle = 0;
  }

  // --- Attitude: bank toward the stick, pitch toward the stick, with
  // a gentle auto-level when the pilot lets go. ---
  const speedFactor = Math.min(1, Math.max(0.25, s.speed / PLANE.cruiseSpeed));
  const targetBank = input.roll * 0.85;
  const bankRate = PLANE.rollRate * speedFactor;
  s.bank += Math.max(-bankRate * dt, Math.min(bankRate * dt, targetBank - s.bank));
  if (input.roll === 0) s.bank *= Math.max(0, 1 - 0.35 * dt);
  const targetPitch = input.pitch * 0.42;
  const pitchRate = PLANE.pitchRate * speedFactor;
  s.pitch += Math.max(-pitchRate * dt, Math.min(pitchRate * dt, targetPitch - s.pitch));
  if (input.pitch === 0) s.pitch *= Math.max(0, 1 - 0.5 * dt);
  // Banked flight needs back pressure or the nose drops.
  s.pitch -= Math.abs(Math.sin(s.bank)) * 0.12 * dt;
  s.pitch = Math.max(-0.6, Math.min(0.6, s.pitch));
  s.bank = Math.max(-1.2, Math.min(1.2, s.bank));

  // --- Heading follows the bank. ---
  s.heading += PLANE.turnFromBank * Math.sin(s.bank) * Math.min(1.4, Math.max(0.4, s.speed / PLANE.cruiseSpeed)) * dt;

  // --- Speed: thrust, drag, and the gravity component along the path. ---
  const thrust = s.engineOn ? s.throttle * PLANE.thrustBase * (1 - s.speed / PLANE.thrustFalloff) : 0;
  const dragK = PLANE.dragCoef * (1 + s.flaps * 0.45 + (s.gearDown ? 0.25 : 0));
  const drag = dragK * s.speed * s.speed;
  let accel = thrust - drag - WORLD.gravity * Math.sin(s.pitch);
  if (s.onGround) {
    accel = thrust - (input.brake ? 9 : 1.2) - drag * 0.4;
    if (s.speed < 0.5 && thrust < 1.2) accel = 0;
  }
  s.speed = Math.max(0, s.speed + accel * dt);

  // --- Vertical speed: lift from the wing, stall sink, bank sink.
  // On the ground she stays on the ground until the takeoff check
  // below rotates her; she never floats off on pitch alone. ---
  let vs = s.speed * Math.sin(s.pitch);
  if (!s.onGround) {
    if (s.speed < stall) vs -= (stall - s.speed) * 0.55; // stalled: she sinks
    vs -= (1 - Math.cos(s.bank)) * s.speed * 0.18; // banked turn costs lift
    const agl = s.pos.y - groundH;
    if (agl < 12) vs += 0.8; // ground effect cushion
  } else {
    vs = 0;
  }
  s.vs = vs;

  // --- Move: forward speed plus the wind. ---
  const fwd = forwardFrom(s.heading, s.pitch);
  s.pos.x += (fwd.x * s.speed + wind.x) * dt;
  s.pos.z += (fwd.z * s.speed + wind.z) * dt;
  if (!s.onGround) s.pos.y += vs * dt;
  s.propAngle += (2 + s.throttle * 38) * dt;

  // --- G force, for the HUD. ---
  s.gForce = 1 + Math.abs(Math.sin(s.bank)) * 0.9 + Math.abs(input.pitch) * 0.15;

  // --- Ground contact: landing, hard landing, crash, ditching. ---
  const groundNow = heightAt(s.pos.x, s.pos.z);
  if (!s.onGround && s.pos.y <= groundNow + 1.8) {
    s.pos.y = groundNow + 1.8;
    const strip = stripUnder(s.pos.x, s.pos.z);
    const sink = -vs;
    const onStrip = strip !== null;
    // Aligned when the ground track runs along the strip axis (either way).
    const axisX = Math.cos(strip ? strip.heading : 0);
    const axisZ = Math.sin(strip ? strip.heading : 0);
    const trackX = Math.sin(s.heading);
    const trackZ = -Math.cos(s.heading);
    const aligned = onStrip && Math.abs(trackX * axisX + trackZ * axisZ) > 0.8;
    if (groundNow <= 0.6) {
      s.crashed = true;
      s.crashCause = 'Ditched in the sea';
    } else if (!s.gearDown) {
      s.crashed = true;
      s.crashCause = 'Belly landing — gear was up';
    } else if (sink >= PLANE.crashVs || s.speed > 58) {
      s.crashed = true;
      s.crashCause = sink >= PLANE.crashVs ? `Impact at ${sink.toFixed(1)} m/s sink` : 'Too fast on touchdown';
    } else {
      s.onGround = true;
      s.landed = true;
      s.pitch = 0;
      s.bank = 0;
      if (sink > PLANE.hardLandingVs) {
        s.integrity = Math.max(0, s.integrity - (sink - PLANE.hardLandingVs) * 8);
      }
      if (!onStrip) s.integrity = Math.max(0, s.integrity - 15); // rough field
      else if (!aligned) s.integrity = Math.max(0, s.integrity - 10); // across the strip
    }
  }
  if (s.onGround) {
    s.pos.y = groundNow + 1.8;
    s.vs = 0;
    s.bank *= 0.9;
    s.groundTime += dt;
    // Rotate when she has flying speed, has rolled a moment (so a
    // touchdown cannot bounce straight back up the same tick and
    // pay the rough-field penalty once per tick), and the pilot is
    // pulling back. (The pitch state itself is damped every tick on
    // the ground, so the check reads the pilot's input, not the
    // damped pitch — reading the damped pitch made rotation marginal
    // and the plane drove off the strip into the hillside.)
    if (s.groundTime > 0.4 && s.speed > stall * 0.92 && input.pitch > 0.15 && s.engineOn) {
      s.onGround = false; // rotate: she flies
      s.landed = false;
      s.groundTime = 0;
    }
  } else {
    s.groundTime = 0;
  }
  return s;
}

/** The strip under a point, or null. Heading is the strip direction. */
export function stripUnder(x, z) {
  for (const strip of Object.values(STRIPS)) {
    const dx = Math.abs(x - strip.x);
    const dz = Math.abs(z - strip.z);
    if (dx < strip.length / 2 + 25 && dz < strip.width / 2 + 12) return strip;
  }
  return null;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
