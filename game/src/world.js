// SKYFERRY — the world. One file, one job: own the scene, the plane,
// the weather, the mission and the falling crates, and step them all
// forward one tick. Everything the loop needs hangs off this object.

import * as THREE from 'three';
import { buildPlaneMesh, freshFlightState, stepFlight } from './aircraft.js';
import { createWeather } from './weather.js';
import { buildTerrain } from './terrain.js';
import { FAR_BEACON, MAIL_RING, freshMission, scoreCrate, stepMission } from './missions.js';
import { MISSIONS, WORLD } from './config.js';

export class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.time = 0;
    this.terrain = buildTerrain(scene, seed);
    this.heightAt = this.terrain.heightAt;
    this.rings = this.terrain.rings;
    this.planeMesh = buildPlaneMesh();
    scene.add(this.planeMesh);
    this.crates = [];
    this.crateGroup = new THREE.Group();
    this.crateGroup.name = 'crates';
    scene.add(this.crateGroup);

    // Mail ring over the lighthouse (night mission) and the far beacon
    // pillar (storm mission): built once, shown only when relevant.
    this.mailRing = new THREE.Mesh(
      new THREE.TorusGeometry(MAIL_RING.radius, 1.6, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc040, emissiveIntensity: 1.0, roughness: 0.4 }),
    );
    this.mailRing.position.set(MAIL_RING.x, MAIL_RING.y, MAIL_RING.z);
    this.mailRing.visible = false;
    scene.add(this.mailRing);
    this.farBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 260, 8),
      new THREE.MeshBasicMaterial({ color: 0x60d0ff, transparent: true, opacity: 0.35 }),
    );
    this.farBeacon.position.set(FAR_BEACON.x, 150, FAR_BEACON.z);
    this.farBeacon.visible = false;
    scene.add(this.farBeacon);

    this.reset(0);
  }

  /** Start mission `index` from the main strip, fresh plane and weather. */
  reset(index) {
    this.mission = freshMission(index);
    this.plane = freshFlightState();
    const night = index === 4 ? 1 : 0;
    const stormOn = index === 3;
    this.weather = createWeather(this.seed, { night, stormOn });
    this.time = 0;
    for (const crate of this.crates) this.crateGroup.remove(crate.mesh);
    this.crates = [];
    this.mailRing.visible = index === 4;
    this.farBeacon.visible = index === 3;
    this.rings.forEach((ring) => {
      ring.visible = index === 0;
    });
  }

  /** The drop action: release a crate if the cargo mission has any left. */
  handleAction() {
    const m = this.mission;
    if (m.index !== 1 || m.cratesLeft <= 0 || this.plane.onGround) return false;
    m.cratesLeft -= 1;
    m.cratesDropped += 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.9 }),
    );
    mesh.position.copy(this.plane.pos);
    mesh.position.y -= 2;
    this.crateGroup.add(mesh);
    const fwd = new THREE.Vector3(Math.sin(this.plane.heading), 0, -Math.cos(this.plane.heading));
    this.crates.push({
      mesh,
      pos: mesh.position,
      vel: new THREE.Vector3(fwd.x * this.plane.speed * 0.7, -1, fwd.z * this.plane.speed * 0.7),
    });
    return true;
  }

  /** Advance the whole simulation one tick. Returns event names. */
  step(dt, input) {
    this.time += dt;
    const events = [];
    const wind = this.weather.windAt(this.plane.pos.x, this.plane.pos.z, this.time);
    // Turbulence shakes the airframe: roll and pitch wobble.
    const turb = wind.turbulence;
    const shaken = {
      pitch: input.pitch + (turb > 0.3 ? Math.sin(this.time * 7.3) * turb * 0.35 : 0),
      roll: input.roll + (turb > 0.3 ? Math.sin(this.time * 9.1 + 2) * turb * 0.4 : 0),
      throttleDelta: input.throttleDelta,
      brake: input.brake,
    };
    stepFlight(this.plane, shaken, wind, this.heightAt, dt);
    events.push(...stepMission(this.mission, this, dt));

    // Falling crates: gravity, wind drift, and the landing verdict.
    for (let i = this.crates.length - 1; i >= 0; i -= 1) {
      const crate = this.crates[i];
      crate.vel.y -= WORLD.gravity * 0.55 * dt; // a crate falls slower than a stone
      crate.pos.x += (crate.vel.x + wind.x * 0.4) * dt;
      crate.pos.z += (crate.vel.z + wind.z * 0.4) * dt;
      crate.pos.y += crate.vel.y * dt;
      crate.mesh.rotation.x += dt * 1.5;
      crate.mesh.rotation.z += dt * 1.1;
      const ground = this.heightAt(crate.pos.x, crate.pos.z);
      if (crate.pos.y <= ground + 1.2) {
        crate.pos.y = ground + 1.2;
        scoreCrate(this.mission, crate);
        events.push('crate');
        this.crateGroup.remove(crate.mesh);
        this.crates.splice(i, 1);
      }
    }

    if (this.plane.crashed) events.push('crash');
    if (this.plane.fuel <= 0 && this.plane.engineOn === false) events.push('flameout');
    return events;
  }
}
