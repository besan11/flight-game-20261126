// SKYFERRY — tuning constants, mission data and shared course geometry.
// All distances in metres, speeds in m/s, times in seconds. Display converts
// to knots / feet in the HUD. One file, one job: every number the game
// balances on lives here so tuning never hunts through gameplay code.

export const WORLD = {
  seedDefault: 7,
  seaLevel: 0,
  area: 4200, // playable square, centred on the origin
  gravity: 9.81,
  knotsPerMs: 1.94384,
  feetPerM: 3.28084,
};

export const PLANE = {
  maxSpeed: 72, // ~140 kt, level-flight top end
  cruiseSpeed: 46, // ~90 kt
  stallSpeed: 28, // ~55 kt clean
  stallSpeedFlaps: 23, // ~45 kt full flaps
  climbSpeed: 34, // best climb, m/s
  maxThrottleAccel: 13.5, // m/s^2 at full throttle, sea level
  dragBase: 0.011, // quadratic drag coefficient
  dragFlaps: 0.02, // extra drag per flap notch
  dragGear: 0.008, // extra drag with the gear down
  liftSlope: 0.055, // lift per m/s of airspeed (arcade lift curve)
  pitchRate: 0.85, // rad/s at full deflection and flying speed
  rollRate: 2.1, // rad/s at full deflection
  turnFromBank: 0.62, // heading change per rad of bank per second
  fuelCapacity: 1.0,
  fuelBurnCruise: 0.0016, // fraction per second at cruise throttle
  fuelBurnFull: 0.0042, // fraction per second at full throttle
  integrityMax: 100,
  hardLandingVs: 6.5, // m/s sink rate that starts damaging the airframe
  crashVs: 11, // m/s sink rate that ends the flight on impact
  thrustBase: 16, // m/s^2 at full throttle, still air
  thrustFalloff: 130, // m/s where thrust fades to zero
  dragCoef: 0.0022, // quadratic drag coefficient
};

export const STRIPS = {
  // Main island strip: flattened plateau, runway along the X axis.
  main: { x: 0, z: 460, heading: 0, length: 420, width: 26, height: 16 },
  // Short island strip on the north island's west shore, for the graded landing.
  north: { x: 350, z: -1380, heading: 0, length: 260, width: 20, height: 18 },
};

// Ring course for RING RUN: eight rings arcing over the islands. It
// climbs out east over the sea (the takeoff heading), runs up the east
// coast, crosses the north island, and comes home down the west side —
// never over the main island's peak, so the climb-out is over flat
// beach and water.
export const RING_COURSE = [
  [750, 140, 300],
  [820, 170, -500],
  [700, 190, -1100],
  [620, 150, -1560],
  [-180, 170, -1420],
  [-920, 140, -820],
  [-1320, 120, -120],
  [-620, 110, 300],
];
export const RING_RADIUS = 18;

// Cargo drop zone: a marked circle on the south beach of the main island.
export const DROP_ZONE = { x: -200, z: 660, radius: 30 };

// Lighthouse island beacon (night mail destination) and the stranded
// hiker's smoke beacon (rescue pickup).
export const LIGHTHOUSE = { x: -1560, z: 820, height: 64 };
export const HIKER = { x: 760, z: -1620, height: 96 };

// Storm front for STORM CROSSING: a band the pilot must cross.
export const STORM = { zMin: -950, zMax: -650, xMin: -900, xMax: 900 };

// Mission definitions. `par` is the target time in seconds; `points`
// is the base score for finishing, before time and landing bonuses.
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tag: 'Fly all 8 rings in order',
    briefing:
      'Thread the ring course over the islands. Rings turn green as you pass them. Smooth turns win: every ring under 240 seconds pays a time bonus.',
    par: 240,
    points: 800,
  },
  {
    id: 'cargo',
    name: 'CARGO DROP',
    tag: 'Drop 3 crates on the beach circle',
    briefing:
      'Three supply crates, one beach circle. Drop with SPACE while slow and low over the mark — fast or high and the crate drifts into the sea.',
    par: 200,
    points: 900,
  },
  {
    id: 'landing',
    name: 'STRIP LANDING',
    tag: 'Land on the short north strip',
    briefing:
      'Take off from the main strip, fly the circuit, and put her down on the 260 m north strip. Graded on centreline, sink rate and speed. Gear down, flaps full.',
    par: 300,
    points: 1000,
  },
  {
    id: 'storm',
    name: 'STORM CROSSING',
    tag: 'Cross the front, reach the far beacon',
    briefing:
      'A storm front sits across the route. Gusts and wind shear throw the plane around — keep the speed up, ride the bumps, and do not fight every gust.',
    par: 260,
    points: 1100,
  },
  {
    id: 'night',
    name: 'NIGHT MAIL',
    tag: 'Fly the mail to the lighthouse',
    briefing:
      'Night run. The lighthouse beam is your guide and the instruments are your eyes. Fly the mail ring over the lighthouse island, then come home.',
    par: 280,
    points: 1200,
  },
  {
    id: 'rescue',
    name: 'RESCUE',
    tag: 'Pick up the hiker, land back home',
    briefing:
      'A hiker is stranded on the north peak — follow the smoke. Pass low over the beacon to pick them up, then land back on the main strip.',
    par: 320,
    points: 1400,
  },
];

export const KEYS = {
  pitchUp: ['ArrowUp', 'KeyW'],
  pitchDown: ['ArrowDown', 'KeyS'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyR'],
  throttleDown: ['ControlLeft', 'ControlRight', 'KeyF'],
  action: ['Space'],
  flaps: ['KeyG'],
  gear: ['KeyL'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyT'],
  brake: ['KeyB'],
};

export const COLORS = {
  skyDay: 0x8ec9e8,
  skyNight: 0x0a1026,
  fogDay: 0xa8c8dd,
  fogNight: 0x0a1026,
  seaDay: 0x1e6f9e,
  seaNight: 0x0a2438,
  sand: 0xd9c28a,
  grass: 0x5d9b4a,
  grassDry: 0x8aa653,
  rock: 0x8a7f72,
  peak: 0x9a938a,
  runway: 0x3a3f46,
  runwayMark: 0xf2f2e8,
};
