// The cargo presentation (scale + wobble exaggeration) is visual only: check the gains apply to the meshes and
// that nothing in the simulation or rules can see them.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CargoView } from '../src/client/cargoView';
import { CARGO_VIEW } from '../src/shared/constants';
import { PizzaCargo, SoupCargo } from '../src/sim/cargo';

describe('cargo view gains', () => {
  it('the group is scaled up on the rack', () => {
    const v = new CargoView();
    expect(v.group.scale.x).toBeCloseTo(CARGO_VIEW.SCALE);
    expect(CARGO_VIEW.SCALE).toBeGreaterThan(1.3);
    expect(CARGO_VIEW.WOBBLE_GAIN).toBeGreaterThan(1.4);
  });

  it('pizza tower offset / tilt are exaggerated by WOBBLE_GAIN relative to the simulated tilt', () => {
    const v = new CargoView();
    v.setKind('pizza', 4);
    v.apply({ kind: 'pizza', a: 4, b: 0.2, c: 0.1 }); // simulated tilt: 0.2 to the right, 0.1 forward
    const top = v.group.children[3]!;
    const plain = new CargoView();
    plain.setKind('pizza', 4);
    plain.apply({ kind: 'pizza', a: 4, b: 0, c: 0 });
    const h = top.position.y; // same height either way
    expect(h).toBeCloseTo(plain.group.children[3]!.position.y);
    // x is negated (three.js +x = rider's left) and amplified: -b * h * 1.4 * gain
    expect(top.position.x).toBeCloseTo(-0.2 * h * 1.4 * CARGO_VIEW.WOBBLE_GAIN, 5);
    expect(top.rotation.z).toBeCloseTo(0.2 * 0.9 * CARGO_VIEW.WOBBLE_GAIN, 5);
    expect(top.rotation.x).toBeCloseTo(0.1 * 0.9 * CARGO_VIEW.WOBBLE_GAIN, 5);
  });

  it('hides boxes that have flown off', () => {
    const v = new CargoView();
    v.setKind('pizza', 5);
    v.apply({ kind: 'pizza', a: 3, b: 0, c: 0 });
    expect(v.group.children.map((c) => c.visible)).toEqual([true, true, true, false, false]);
  });

  it('ignores non-finite summaries (remote data)', () => {
    const v = new CargoView();
    v.setKind('soup', 1);
    v.apply({ kind: 'soup', a: 1, b: 0.1, c: 0 });
    const before = v.group.children[0]!.children.map((c) => c.rotation.z);
    v.apply({ kind: 'soup', a: 1, b: NaN, c: 0 });
    expect(v.group.children[0]!.children.map((c) => c.rotation.z)).toEqual(before);
  });

  it('the simulation and rules never see the view gains', () => {
    const root = path.resolve(__dirname, '..', 'src');
    const files = [...fs.readdirSync(path.join(root, 'sim')).map((f) => path.join(root, 'sim', f)), ...fs.readdirSync(path.join(root, 'shared')).filter((f) => f !== 'constants.ts').map((f) => path.join(root, 'shared', f))];
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toContain('CARGO_VIEW');
    // and the sim output does not depend on them: same inputs, same tilt, whatever the gains are
    const pizza = new PizzaCargo(4);
    for (let i = 0; i < 60; i++) pizza.update(1 / 60, { x: 8, y: 0, z: 0 }, 0, 10);
    expect(Math.abs(pizza.tx)).toBeGreaterThan(0.05);
    expect(Math.abs(pizza.tx)).toBeLessThan(0.35); // the real tip limit, not the exaggerated one
    const soup = new SoupCargo();
    for (let i = 0; i < 60; i++) soup.update(1 / 60, { x: 8, y: 0, z: 0 }, 0, 10);
    expect(soup.level).toBe(1);
  });
});
