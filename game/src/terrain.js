// SKYFERRY — the islands. One file, one job: the ground the plane
// flies over and lands on. It owns the height function (mesh and physics
// share it, so what you see is what you hit), the ocean, trees, clouds,
// runways, rings, beacons and the lighthouse.

import * as THREE from 'three';
import { COLORS, DROP_ZONE, HIKER, LIGHTHOUSE, RING_COURSE, RING_RADIUS, STRIPS } from './config.js';
import { makeNoise2D, mulberry32 } from './random.js';

/** Island bumps: [x, z, radius, peak height]. */
const ISLANDS = [
  [0, 0, 1050, 95], // main island, home strip
  [620, -1420, 520, 80], // north island, short strip + hiker peak
  [-1560, 820, 480, 80], // lighthouse island
  [-1180, -620, 320, 42], // small western rock
  [1150, 900, 300, 36], // small eastern rock
];

function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Build the height function for a seed. Pure and shared: the mesh,
// the flight model's ground collision and the landing check all call it. */
export function makeHeightAt(seed) {
  const detail = makeNoise2D(seed * 17 + 3);
  const rough = makeNoise2D(seed * 29 + 11);
  return function heightAt(x, z) {
    let h = -4; // seabed baseline, so the shore fades under the water
    for (const [ix, iz, r, peak] of ISLANDS) {
      const d = Math.hypot(x - ix, z - iz);
      if (d < r) {
        const fall = (Math.cos((d / r) * Math.PI) + 1) / 2;
        h += peak * fall * fall;
      }
    }
    if (h > 2) {
      h += detail(x * 0.004, z * 0.004) * 9 + rough(x * 0.013, z * 0.013) * 3.5;
    }
    if (h > 0 && h < 7) h *= 0.55; // gentle beach shelf
    // Flatten the two strips into plateaus the plane can use.
    for (const strip of Object.values(STRIPS)) {
      const dx = (x - strip.x) / (strip.length * 0.75);
      const dz = (z - strip.z) / (strip.width * 4.5);
      const mask = 1 - smoothstep(0.55, 1, Math.hypot(dx, dz));
      if (mask > 0) h = h + (strip.height - h) * mask;
    }
    return h;
  };
}

/** Colour a terrain vertex by height and slope: sand, grass, rock, peak. */
function vertexColor(h, slope, out) {
  if (h < 4) out.setHex(COLORS.sand);
  else if (h < 55) out.setHex(COLORS.grass).lerp(new THREE.Color(COLORS.grassDry), Math.min(1, h / 55));
  else if (h < 105) out.setHex(COLORS.rock);
  else out.setHex(COLORS.peak);
  if (slope > 0.55) out.lerp(new THREE.Color(COLORS.rock), 0.6);
  return out;
}

/**
 * Build the whole island group and add it to `scene`.
 * Returns handles the world loop needs: rings, clouds, beacons, windsock.
 */
export function buildTerrain(scene, seed) {
  const rand = mulberry32(seed * 7 + 1);
  const heightAt = makeHeightAt(seed);
  const group = new THREE.Group();
  group.name = 'terrain';
  const color = new THREE.Color();

  // --- Ground: a displaced plane with painted vertex colours. ---
  const size = 4200;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const hx = heightAt(x + 6, z) - heightAt(x - 6, z);
    const hz = heightAt(x, z + 6) - heightAt(x, z - 6);
    const slope = Math.hypot(hx, hz) / 12;
    vertexColor(h, slope, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  ground.name = 'ground';
  group.add(ground);

  // --- Ocean: one big plane at sea level. ---
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ color: COLORS.seaDay, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.94 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0.4;
  ocean.name = 'ocean';
  group.add(ocean);

  // --- Trees: instanced trunks + canopies on grassy, gentle ground. ---
  const treeSpots = [];
  let guard = 0;
  while (treeSpots.length < 320 && guard < 9000) {
    guard += 1;
    const x = (rand() - 0.5) * 3600;
    const z = (rand() - 0.5) * 3600;
    const h = heightAt(x, z);
    if (h < 9 || h > 60) continue;
    const slope = Math.abs(heightAt(x + 5, z) - heightAt(x - 5, z)) + Math.abs(heightAt(x, z + 5) - heightAt(x, z - 5));
    if (slope > 3.5) continue;
    let onStrip = false;
    for (const s of Object.values(STRIPS)) {
      if (Math.abs(x - s.x) < s.length * 0.6 && Math.abs(z - s.z) < s.width * 4) onStrip = true;
    }
    if (!onStrip) treeSpots.push([x, h, z]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const canopyGeo = new THREE.ConeGeometry(4.2, 11, 6);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  treeSpots.forEach(([x, h, z], i) => {
    const s = 0.8 + rand() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m4.compose(new THREE.Vector3(x, h + 2.5 * s, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, h + (5 + 5.5) * s, z), q, new THREE.Vector3(s, s, s));
    canopies.setMatrixAt(i, m4);
  });
  group.add(trunks, canopies);

  // --- Runways: dark strips with white threshold bars and centreline. ---
  const runwayMeshes = [];
  for (const strip of Object.values(STRIPS)) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(strip.length, strip.width),
      new THREE.MeshStandardMaterial({ color: COLORS.runway, roughness: 0.9 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = strip.heading;
    pad.position.set(strip.x, strip.height + 0.15, strip.z);
    pad.name = 'runway';
    group.add(pad);
    runwayMeshes.push(pad);
    const markMat = new THREE.MeshStandardMaterial({ color: COLORS.runwayMark, roughness: 0.8 });
    for (const end of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), markMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(strip.x + end * (strip.length / 2 - 14), strip.height + 0.3, strip.z);
      group.add(bar);
    }
    for (let i = -4; i <= 4; i += 1) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.1), markMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(strip.x + i * 34, strip.height + 0.3, strip.z);
      group.add(dash);
    }
  }

  // --- Rings: the ring-run course, lit from within. ---
  const rings = RING_COURSE.map(([x, y, z], i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.6, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8800, emissiveIntensity: 0.7, roughness: 0.4 }),
    );
    ring.position.set(x, y, z);
    ring.name = `ring-${i}`;
    group.add(ring);
    return ring;
  });

  // --- Drop zone: a painted circle on the south beach. ---
  const dropRing = new THREE.Mesh(
    new THREE.RingGeometry(DROP_ZONE.radius - 2, DROP_ZONE.radius, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5040, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.set(DROP_ZONE.x, heightAt(DROP_ZONE.x, DROP_ZONE.z) + 0.4, DROP_ZONE.z);
  group.add(dropRing);

  // --- Lighthouse: striped tower on the west island + rotating beam. ---
  const lightBase = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 7, LIGHTHOUSE.height, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 }),
  );
  const lightTop = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.5, 8, 10),
    new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.7 }),
  );
  const lhY = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z);
  lightBase.position.set(LIGHTHOUSE.x, lhY + LIGHTHOUSE.height / 2, LIGHTHOUSE.z);
  lightTop.position.set(LIGHTHOUSE.x, lhY + LIGHTHOUSE.height + 4, LIGHTHOUSE.z);
  group.add(lightBase, lightTop);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 260, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.set(LIGHTHOUSE.x, lhY + LIGHTHOUSE.height + 6, LIGHTHOUSE.z);
  beam.rotation.z = Math.PI / 2;
  beam.name = 'beam';
  group.add(beam);
  const beaconLight = new THREE.PointLight(0xffe9a0, 0, 500, 1.6);
  beaconLight.position.set(LIGHTHOUSE.x, lhY + LIGHTHOUSE.height + 8, LIGHTHOUSE.z);
  group.add(beaconLight);

  // --- Hiker smoke: a rising column marking the rescue pickup. ---
  const smoke = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(6 + i * 2.2, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.55 - i * 0.07, roughness: 1 }),
    );
    puff.position.set(i * 2.5, 8 + i * 12, i * 1.5);
    smoke.add(puff);
  }
  const hikerY = heightAt(HIKER.x, HIKER.z);
  smoke.position.set(HIKER.x, hikerY, HIKER.z);
  smoke.name = 'smoke';
  group.add(smoke);

  // --- Windsock at the main strip. ---
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 12, 6),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  sockPole.position.set(STRIPS.main.x + STRIPS.main.length / 2 + 14, STRIPS.main.height + 6, STRIPS.main.z + 18);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0xff7020, emissive: 0x882200, emissiveIntensity: 0.4 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(STRIPS.main.x + STRIPS.main.length / 2 + 17, STRIPS.main.height + 11, STRIPS.main.z + 18);
  sock.name = 'windsock';
  group.add(sockPole, sock);

  // --- Clouds: soft white puffs drifting with the wind. ---
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 16; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = 14 + rand() * 22;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
      puff.scale.y = 0.42;
      puff.position.set((rand() - 0.5) * 55, (rand() - 0.5) * 8, (rand() - 0.5) * 30);
      cloud.add(puff);
    }
    cloud.position.set((rand() - 0.5) * 3800, 260 + rand() * 180, (rand() - 0.5) * 3800);
    cloud.name = `cloud-${i}`;
    group.add(cloud);
    clouds.push(cloud);
  }

  scene.add(group);
  return { group, heightAt, rings, clouds, beam, beaconLight, windsock: sock, dropRing, smoke, runwayMeshes };
}
