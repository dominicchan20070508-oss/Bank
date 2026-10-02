import { describe, expect, it } from 'vitest';
import type { BikeInput } from '../src/client/bike';
import { Input } from '../src/client/input';
import { mergeInput, type InputSource } from '../src/client/inputMerge';

const none: BikeInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

describe('mergeInput (keyboard + touch)', () => {
  it('without a touch source the keyboard passes through unchanged', () => {
    const kb = { throttle: 1, brake: 0, steer: -1, handbrake: true };
    expect(mergeInput(kb, null)).toEqual(kb);
    expect(mergeInput(kb, undefined)).toEqual(kb);
  });

  it('the strongest throttle / brake wins; handbrake is an OR', () => {
    expect(mergeInput({ ...none, throttle: 1 }, { ...none, brake: 1 })).toEqual({ throttle: 1, brake: 1, steer: 0, handbrake: false });
    expect(mergeInput({ ...none, throttle: 0.4 }, { ...none, throttle: 1 }).throttle).toBe(1);
    expect(mergeInput(none, { ...none, handbrake: true }).handbrake).toBe(true);
    expect(mergeInput({ ...none, handbrake: true }, none).handbrake).toBe(true);
  });

  it('steering adds up and is clamped to [-1, 1]; neither source overwrites the other', () => {
    expect(mergeInput({ ...none, steer: 1 }, { ...none, steer: 0 }).steer).toBe(1);
    expect(mergeInput({ ...none, steer: 0 }, { ...none, steer: -0.6 }).steer).toBeCloseTo(-0.6);
    expect(mergeInput({ ...none, steer: 1 }, { ...none, steer: 0.5 }).steer).toBe(1);
    expect(mergeInput({ ...none, steer: 1 }, { ...none, steer: -0.5 }).steer).toBeCloseTo(0.5);
    expect(mergeInput({ ...none, steer: -1 }, { ...none, steer: -1 }).steer).toBe(-1);
  });
});

describe('Input with a touch source', () => {
  class FakeTouch implements InputSource {
    state: BikeInput = { ...none };
    honk = false;
    reset = false;
    read() {
      return this.state;
    }
    consumeHonk() {
      const v = this.honk;
      this.honk = false;
      return v;
    }
    consumeReset() {
      const v = this.reset;
      this.reset = false;
      return v;
    }
  }

  it('touch drives the bike when the keyboard is idle, and the debug override still wins over both', () => {
    const input = new Input();
    const touch = new FakeTouch();
    input.setTouchSource(touch);
    touch.state = { throttle: 1, brake: 0, steer: 0.7, handbrake: false };
    expect(input.read()).toEqual({ throttle: 1, brake: 0, steer: 0.7, handbrake: false });
    input.setOverride({ steer: -1 });
    expect(input.read().steer).toBe(-1);
    expect(input.read().throttle).toBe(1);
    input.setOverride(null);
    expect(input.read().steer).toBe(0.7);
  });

  it('horn and reset taps are delivered once, and nothing is delivered while input is disabled', () => {
    const input = new Input();
    const touch = new FakeTouch();
    input.setTouchSource(touch);
    touch.honk = true;
    touch.reset = true;
    expect(input.consumeHonk()).toBe(true);
    expect(input.consumeHonk()).toBe(false);
    expect(input.consumeReset()).toBe(true);
    expect(input.consumeReset()).toBe(false);
    input.enabled = false;
    touch.honk = true;
    expect(input.consumeHonk()).toBe(false);
    expect(touch.honk).toBe(false); // queue drained even though disabled: no stale honk when the next round starts
    expect(input.read()).toEqual(none);
  });
});
