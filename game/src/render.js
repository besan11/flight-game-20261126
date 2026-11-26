// SKYFERRY — the camera and the light. One file, one job: the
// three.js renderer, the chase camera that never fights the pilot,
// the sky dome, sun and fog, and the per-frame visual sync (propeller,
// rings, beacon beam, windsock, clouds).

import * as THREE from 'three';
import { COLORS } from './config.js';

const SKY_VERTEX = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vPos;
void main() {
  float h = normalize(vPos).y * 0.5 + 0.5;
  vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.75));
  gl_FragColor = vec4(col, 1.0);
}`;

export class GameRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 9000);
    this.camera.rotation.order = 'YXZ';
    this.camPos = new THREE.Vector3(0, 60, 120);
    this.camLook = new THREE.Vector3();

    // Sky dome: a gradient shell that follows the camera.
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(COLORS.skyDay) },
        uHorizon: { value: new THREE.Color(0xcfe5f2) },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(6500, 24, 16), this.skyMat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(COLORS.fogDay, 900, 5200);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
    this.sun.position.set(1800, 2600, -1200);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd9ee, 0x4a5a3a, 1.15);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
    this.moon.position.set(-1500, 2000, 900);
    this.scene.add(this.moon);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Day (0) to night (1) lighting. Called every frame; cheap lerps. */
  setNight(night) {
    const day = 1 - night;
    this.skyMat.uniforms.uTop.value.setHex(COLORS.skyDay).lerp(new THREE.Color(COLORS.skyNight), night);
    this.skyMat.uniforms.uHorizon.value.setHex(0xcfe5f2).lerp(new THREE.Color(0x1a2440), night);
    this.scene.fog.color.setHex(COLORS.fogDay).lerp(new THREE.Color(COLORS.fogNight), night);
    this.sun.intensity = 2.6 * day + 0.12;
    this.hemi.intensity = 1.15 * day + 0.22;
    this.moon.intensity = 0.9 * night;
  }

  /** Chase camera: behind and above the plane, eased, looking ahead. */
  updateCamera(world, dt) {
    const p = world.plane;
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, -Math.cos(p.heading));
    const dist = 22 + p.speed * 0.06;
    const height = 6 + p.speed * 0.02;
    const target = new THREE.Vector3().copy(p.pos).addScaledVector(fwd, -dist);
    target.y += height;
    const k = 1 - Math.exp(-dt * 5.5);
    this.camPos.lerp(target, k);
    // Low over the ground, the chase cam tips down so the ground ahead
    // (a drop zone, a strip) stays in frame instead of sliding under it.
    // Never on the ground: parked, the camera stays level on the vista.
    const agl = Math.max(0, p.pos.y - world.heightAt(p.pos.x, p.pos.z));
    const lookDown = p.onGround ? 0 : Math.max(0, Math.min(1, (130 - agl) / 80)) * 9;
    const look = new THREE.Vector3().copy(p.pos).addScaledVector(fwd, 26);
    look.y += p.vs * 0.35 - lookDown;
    this.camLook.lerp(look, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.sky.position.copy(this.camera.position);
  }

  /** Sync every visual that follows simulation state, then draw. */
  render(world, dt) {
    const p = world.plane;
    this.setNight(world.weather.night);
    // Plane mesh follows the flight state.
    const mesh = world.planeMesh;
    mesh.position.copy(p.pos);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = -p.heading;
    mesh.rotation.x = p.pitch;
    mesh.rotation.z = -p.bank;
    mesh.userData.propeller.rotation.z = p.propAngle;
    mesh.userData.gear.visible = p.gearDown;
    // Next ring pulses so the pilot always sees the target.
    const next = world.rings[world.mission.ringsPassed];
    world.rings.forEach((ring, i) => {
      const done = i < world.mission.ringsPassed;
      ring.material.emissiveIntensity = done ? 0.08 : ring === next ? 1.4 + Math.sin(world.time * 5) * 0.5 : 0.5;
      ring.material.color.setHex(done ? 0x2fae5f : ring === next ? 0xffb020 : 0xff7040);
      ring.visible = world.mission.index === 0 || done;
    });
    // Lighthouse beam sweeps; beacon light glows at night.
    world.terrain.beam.rotation.y += dt * 0.9;
    world.terrain.beaconLight.intensity = world.weather.night > 0.5 ? 2.2 + Math.sin(world.time * 2.4) * 0.8 : 0;
    world.terrain.beam.visible = world.weather.night > 0.3;
    // Windsock points downwind.
    const wind = world.weather.windAt(p.pos.x, p.pos.z, world.time);
    world.terrain.windsock.rotation.y = Math.atan2(wind.x, wind.z);
    world.terrain.windsock.rotation.z = Math.PI / 2 - Math.min(0.5, wind.speed * 0.02);
    // Clouds drift with the wind and wrap around the play area.
    for (const cloud of world.terrain.clouds) {
      cloud.position.x += wind.x * dt * 0.35;
      cloud.position.z += wind.z * dt * 0.35;
      if (cloud.position.x > 2100) cloud.position.x = -2100;
      if (cloud.position.x < -2100) cloud.position.x = 2100;
      if (cloud.position.z > 2100) cloud.position.z = -2100;
      if (cloud.position.z < -2100) cloud.position.z = 2100;
    }
    this.updateCamera(world, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
