// SKYFERRY — keyboard input. One file, one job: turn raw key events
// into the named controls the flight model reads, with edge-triggered
// actions (flaps, gear, drop, pause) reported exactly once per press.

import { KEYS } from './config.js';

const HELD = new Set();
const PRESSED = new Set();

function codeOf(event) {
  return event.code;
}

function install() {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    HELD.add(codeOf(event));
    PRESSED.add(codeOf(event));
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    HELD.delete(codeOf(event));
  });
  window.addEventListener('blur', () => {
    HELD.clear();
  });
}

function anyHeld(codes) {
  return codes.some((code) => HELD.has(code));
}

/** Read the current control state. `consume()` clears edge presses. */
export const input = {
  install,
  /** Continuous axes: pitch -1..1 (up positive), roll -1..1 (right positive). */
  axes() {
    const pitch = (anyHeld(KEYS.pitchUp) ? 1 : 0) - (anyHeld(KEYS.pitchDown) ? 1 : 0);
    const roll = (anyHeld(KEYS.rollRight) ? 1 : 0) - (anyHeld(KEYS.rollLeft) ? 1 : 0);
    return { pitch, roll };
  },
  /** Throttle lever movement: +1 up, -1 down, 0 still. */
  throttleDelta() {
    return (anyHeld(KEYS.throttleUp) ? 1 : 0) - (anyHeld(KEYS.throttleDown) ? 1 : 0);
  },
  brakeHeld() {
    return anyHeld(KEYS.brake);
  },
  /** True once per key press; cleared by consume(). */
  pressed(codes) {
    return codes.some((code) => PRESSED.has(code));
  },
  actionPressed() {
    return this.pressed(KEYS.action);
  },
  flapsPressed() {
    return this.pressed(KEYS.flaps);
  },
  gearPressed() {
    return this.pressed(KEYS.gear);
  },
  pausePressed() {
    return this.pressed(KEYS.pause);
  },
  restartPressed() {
    return this.pressed(KEYS.restart);
  },
  consume() {
    PRESSED.clear();
  },
};
