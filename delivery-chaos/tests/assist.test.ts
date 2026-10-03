import { describe, expect, it } from 'vitest';
import { ASSIST, BIKE } from '../src/shared/constants';
import { applyAssist, newAssistState, steadyDrive, type AssistContext } from '../src/client/assist';
import type { BikeInput } from '../src/client/bike';

const IDLE: BikeInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const ctx = (p: Partial<AssistContext> = {}): AssistContext => ({ autoGas: true, speedFwd: 5, inZone: false, crashed: false, dt: 1 / 60, ...p });

describe('auto-gas', () => {
  it('rolls on its own at the cruise throttle, steering and handbrake pass through', () => {
    const out = applyAssist(newAssistState(), { ...IDLE, steer: 0.4, handbrake: true }, ctx());
    expect(out.throttle).toBe(ASSIST.CRUISE_THROTTLE);
    expect(out.brake).toBe(0);
    expect(out.steer).toBe(0.4);
    expect(out.handbrake).toBe(true);
    expect(ASSIST.CRUISE_THROTTLE).toBeLessThan(1);
    expect(ASSIST.CRUISE_THROTTLE * BIKE.VMAX).toBeGreaterThan(8); // brisk enough to be fun
  });

  it('the GAS button is a boost: full throttle', () => {
    expect(applyAssist(newAssistState(), { ...IDLE, throttle: 1 }, ctx()).throttle).toBe(1);
  });

  it('BRAKE slows the bike (no throttle) while it is moving', () => {
    const out = applyAssist(newAssistState(), { ...IDLE, brake: 1 }, ctx({ speedFwd: 8 }));
    expect(out).toMatchObject({ throttle: 0, brake: 1 });
  });

  it('after braking to a stop the bike stays put; releasing BRAKE rolls on again', () => {
    const st = newAssistState();
    expect(applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 0.1 })).brake).toBe(0);
    expect(applyAssist(st, IDLE, ctx({ speedFwd: 0 })).throttle).toBe(ASSIST.CRUISE_THROTTLE);
  });

  it('a short brake press at a standstill does not reverse; a long press does', () => {
    const st = newAssistState();
    let reversed = false;
    // 0.3 s tap
    for (let i = 0; i < 18; i++) reversed ||= applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 0 })).brake > 0;
    expect(reversed).toBe(false);
    applyAssist(st, IDLE, ctx({ speedFwd: 0 })); // released: the counter resets
    expect(st.brakeHeld).toBe(0);
    // a fresh tap of 0.5 s still does nothing ...
    for (let i = 0; i < 30; i++) reversed ||= applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 0 })).brake > 0;
    expect(reversed).toBe(false);
    // ... held past REVERSE_HOLD the brake input goes through and the bike reverses
    let out = IDLE;
    for (let i = 0; i < 20; i++) out = applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 0 }));
    expect(out.brake).toBe(1);
    expect(out.throttle).toBe(0);
    // and keeps reversing while it is held, even once the bike is moving backwards
    expect(applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: -2 })).brake).toBe(1);
  });

  it('the hold timer starts when the bike has stopped, not when the button went down', () => {
    const st = newAssistState();
    for (let i = 0; i < 90; i++) applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 10 - i * 0.12 > 0.7 ? 10 - i * 0.12 : 0.7 })); // 1.5 s of braking from speed
    expect(st.brakeHeld).toBe(0);
    expect(applyAssist(st, { ...IDLE, brake: 1 }, ctx({ speedFwd: 0 })).brake).toBe(0);
  });

  it('with auto-gas OFF nothing changes: throttle and brake pass straight through (v0.2)', () => {
    const st = newAssistState();
    for (const raw of [IDLE, { ...IDLE, throttle: 1 }, { ...IDLE, brake: 1 }, { ...IDLE, throttle: 0.3, steer: -1, handbrake: true }]) {
      for (const speedFwd of [-3, 0, 0.2, 6]) expect(applyAssist(st, raw, ctx({ autoGas: false, speedFwd }))).toEqual(raw);
    }
  });
});

describe('auto-slow in the target circle (applies with auto-gas on or off)', () => {
  it.each([true, false])('autoGas=%s: stops accelerating and brakes gently while fast, then lets the bike settle', (autoGas) => {
    const fast = applyAssist(newAssistState(), IDLE, ctx({ autoGas, inZone: true, speedFwd: 9 }));
    expect(fast.throttle).toBe(0);
    expect(fast.brake).toBe(ASSIST.ZONE_BRAKE);
    expect(ASSIST.ZONE_BRAKE).toBeLessThan(1);
    const slow = applyAssist(newAssistState(), IDLE, ctx({ autoGas, inZone: true, speedFwd: ASSIST.ZONE_TARGET_SPEED - 0.1 }));
    expect(slow.throttle).toBe(0);
    expect(slow.brake).toBe(0); // never brakes into reverse
    expect(ASSIST.ZONE_TARGET_SPEED).toBeLessThan(4); // below ZONE.MAX_SPEED
  });

  it.each([true, false])('autoGas=%s: holding gas / boost overrides it, so a rider can always drive through', (autoGas) => {
    const out = applyAssist(newAssistState(), { ...IDLE, throttle: 1 }, ctx({ autoGas, inZone: true, speedFwd: 9 }));
    expect(out.throttle).toBe(1);
    expect(out.brake).toBe(0);
  });

  it('brakes harder (up to ZONE_BRAKE_MAX) only when the rider arrives fast, and gently from the auto-gas cruise speed', () => {
    const cruiseSpeed = ASSIST.CRUISE_THROTTLE * BIKE.VMAX;
    const gentle = applyAssist(newAssistState(), IDLE, ctx({ autoGas: true, inZone: true, speedFwd: cruiseSpeed, zoneDist: 6.5 }));
    expect(gentle.brake).toBeLessThanOrEqual(ASSIST.ZONE_BRAKE + 0.05);
    const fast = applyAssist(newAssistState(), IDLE, ctx({ autoGas: false, inZone: true, speedFwd: 16, zoneDist: 6.5 }));
    expect(fast.brake).toBeGreaterThan(ASSIST.ZONE_BRAKE + 0.1);
    expect(fast.brake).toBeLessThanOrEqual(ASSIST.ZONE_BRAKE_MAX);
    // right at the centre it does not demand an absurd deceleration
    expect(applyAssist(newAssistState(), IDLE, ctx({ autoGas: false, inZone: true, speedFwd: 16, zoneDist: 0 })).brake).toBeLessThanOrEqual(ASSIST.ZONE_BRAKE_MAX);
  });

  it('a rider who brakes by hand keeps their own brake', () => {
    expect(applyAssist(newAssistState(), { ...IDLE, brake: 1 }, ctx({ autoGas: false, inZone: true, speedFwd: 9 })).brake).toBe(1);
  });

  it('leaving the circle restores the cruise at once (auto-gas) / does nothing (manual)', () => {
    expect(applyAssist(newAssistState(), IDLE, ctx({ autoGas: true, inZone: false, speedFwd: 1 })).throttle).toBe(ASSIST.CRUISE_THROTTLE);
    expect(applyAssist(newAssistState(), IDLE, ctx({ autoGas: false, inZone: false, speedFwd: 9 }))).toEqual(IDLE);
  });

  it('does nothing while crashed; keeps steering', () => {
    const out = applyAssist(newAssistState(), { ...IDLE, steer: -0.5 }, ctx({ autoGas: false, inZone: true, crashed: true, speedFwd: 9 }));
    expect(out).toEqual({ ...IDLE, steer: -0.5 });
  });

  it('a manual keyboard rider who just coasts into a circle is slowed; one who keeps W down is not', () => {
    expect(applyAssist(newAssistState(), IDLE, ctx({ autoGas: false, inZone: true, speedFwd: 10 })).brake).toBeGreaterThan(0);
    expect(applyAssist(newAssistState(), { ...IDLE, throttle: 1 }, ctx({ autoGas: false, inZone: true, speedFwd: 10 })).brake).toBe(0);
  });
});

describe('steadier rack', () => {
  it('scales the wobble drive by 0.7 when on and leaves it alone when off', () => {
    const a = { x: 10, y: -4, z: 6 };
    const scratch = { x: 0, y: 0, z: 0 };
    const off = steadyDrive(a, 0.4, false, scratch);
    expect(off.a).toBe(a);
    expect(off.lean).toBe(0.4);
    const on = steadyDrive(a, 0.4, true, scratch);
    expect(on.a.x).toBeCloseTo(7, 9);
    expect(on.a.y).toBeCloseTo(-2.8, 9);
    expect(on.a.z).toBeCloseTo(4.2, 9);
    expect(on.lean).toBeCloseTo(0.28, 6);
    expect(a).toEqual({ x: 10, y: -4, z: 6 }); // the bike's own acceleration is untouched
  });
});
