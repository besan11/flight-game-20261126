// SKYFERRY — wind, gusts and the storm front. One file, one job:
// answer "what is the air doing here, now?" for the flight model,
// the clouds and the windsock, from a seeded gust field.

import { STORM } from './config.js';
import { makeNoise2D } from './random.js';

/**
 * Build a weather model for one seed.
 * `night` is 0 (day) to 1 (full night); `stormOn` enables the front.
 */
export function createWeather(seed, { night = 0, stormOn = false } = {}) {
  const gustNoise = makeNoise2D(seed * 31 + 7);
  const baseDir = 0.6; // wind from the north-west, radians
  const baseSpeed = 6; // m/s steady trade wind

  function insideStorm(x, z) {
    return stormOn && x > STORM.xMin && x < STORM.xMax && z > STORM.zMin && z < STORM.zMax;
  }

  return {
    night,
    stormOn,
    insideStorm,
    /** Wind vector (m/s) at a position and time, plus gust strength 0..1. */
    windAt(x, z, t) {
      const gust = gustNoise(t * 0.11, x * 0.004 + z * 0.003);
      const gust2 = gustNoise(t * 0.23 + 40, z * 0.006 - x * 0.002);
      let speed = baseSpeed + gust * 2.2 + gust2 * 1.1;
      let dir = baseDir + gust2 * 0.12;
      let turbulence = Math.abs(gust) * 0.25 + Math.abs(gust2) * 0.15;
      if (insideStorm(x, z)) {
        speed += 14 + gust * 8;
        dir += gust * 0.45;
        turbulence = 0.65 + Math.abs(gust) * 0.35;
      }
      return {
        x: Math.sin(dir) * speed,
        z: -Math.cos(dir) * speed,
        speed,
        dir,
        turbulence,
        gust,
      };
    },
    /** True when the shear is strong enough to warn the pilot. */
    shearWarning(x, z, t) {
      if (!insideStorm(x, z)) return false;
      const w = this.windAt(x, z, t);
      return w.turbulence > 0.8;
    },
  };
}
