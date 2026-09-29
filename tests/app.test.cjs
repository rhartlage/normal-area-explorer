'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const NormalMath = require('../normal-math.js');

// This deliberately small DOM substitutes only the browser APIs used by the
// app. It exercises model/formula/event logic; real-browser layout is separate.
function app() {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = new Map();
  class Element {
    constructor() { this.listeners = {}; this.style = {}; this.dataset = {}; this.options = Array.from({ length: 4 }, () => ({})); this._value = ''; }
    get value() { return this._value; }
    set value(value) { this._value = String(value); }
    addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
    dispatch(name, properties = {}) { for (const callback of this.listeners[name] ?? []) callback({ target: this, preventDefault() {}, ...properties }); }
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; }
    getScreenCTM() { return { inverse() { return {}; } }; }
    setPointerCapture() {}
  }
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element();
    element.value = match[0].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    elements.set(match[1], element);
  }
  for (const [id, value] of [['solveMode', 'probability'], ['regionType', 'left'], ['inputScale', 'x']]) elements.get(id).value = value;
  const context = vm.createContext({ NormalMath, document: {
    getElementById(id) { assert.ok(elements.has(id), `Unknown DOM id ${id}`); return elements.get(id); },
    querySelectorAll() { return []; },
  }, navigator: { clipboard: { async writeText() {} } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  return {
    el: id => elements.get(id),
    run: expression => vm.runInContext(expression, context),
    get model() { return vm.runInContext('current', context); },
    set(values) { for (const [id, value] of Object.entries(values)) elements.get(id).value = value; vm.runInContext('update()', context); return this; },
    change(id, value) { elements.get(id).value = value; elements.get(id).dispatch('change'); return this; },
    formulaValues() {
      const unescape = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      return [...elements.get('excelFormulas').innerHTML.matchAll(/<code>([^<]*)<\/code>/g)].map(match => {
        const formula = unescape(match[1]);
        const expression = formula.slice(1).replace(/NORM\.S\.DIST/g, 'standardCDF').replace(/NORM\.DIST/g, 'rawCDF').replace(/NORM\.S\.INV/g, 'standardInverse').replace(/NORM\.INV/g, 'rawInverse').replace(/\bTRUE\b/g, 'true');
        const value = new Function('standardCDF', 'rawCDF', 'standardInverse', 'rawInverse', `return (${expression});`)(
          NormalMath.cdf, (x, mu, sigma) => NormalMath.cdf((x - mu) / sigma),
          NormalMath.inv, (p, mu, sigma) => mu + sigma * NormalMath.inv(p));
        return { formula, value };
      });
    },
  };
}

function close(actual, expected, absolute = 2e-13, relative = 0) {
  assert.ok(Math.abs(actual - expected) <= Math.max(absolute, Math.abs(expected) * relative), `${actual} != ${expected}`);
}

test('forward raw and standardized formulas match every shaded mode with negative mean', () => {
  for (const inputScale of ['x', 'z']) {
    for (const regionType of ['left', 'right', 'between', 'absGreater']) {
      const tool = app().set({ muInput: -20, sigmaInput: 3, inputScale, regionType,
        aInput: regionType === 'absGreater' ? inputScale === 'x' ? 4.5 : 1.5 : inputScale === 'x' ? -21.5 : -0.5,
        bInput: inputScale === 'x' ? -15.5 : 1.5 });
      assert.ok(tool.model, tool.el('inputError').textContent);
      for (const { value } of tool.formulaValues()) close(value, tool.model.p);
    }
  }
});

test('changing input scales preserves boundaries and probability in every mode', () => {
  for (const regionType of ['left', 'right', 'between', 'absGreater']) {
    const tool = app().set({ muInput: -12.5, sigmaInput: 2.5, regionType,
      aInput: regionType === 'absGreater' ? 5 : -15, bInput: -7.5 });
    const initial = tool.model;
    tool.change('inputScale', 'z');
    close(tool.model.p, initial.p);
    initial.zs.forEach((z, i) => close(tool.model.zs[i], z));
    close(Number(tool.el('aInput').value), regionType === 'absGreater' ? 2 : -1);
    tool.change('inputScale', 'x');
    close(tool.model.p, initial.p);
    close(Number(tool.el('aInput').value), regionType === 'absGreater' ? 5 : -15);
  }
});

test('two-tail raw inputs mean distance from mu, including distance zero', () => {
  const tool = app().set({ muInput: -40, sigmaInput: 10, regionType: 'absGreater', aInput: 15 });
  assert.deepEqual(Array.from(tool.model.xs), [-55, -25]);
  close(tool.model.p, 2 * NormalMath.sf(1.5));
  tool.set({ aInput: 0 });
  close(tool.model.p, 1);
  assert.deepEqual(Array.from(tool.model.xs), [-40, -40]);
});

test('inverse cutoffs and both Excel function families agree for every region', () => {
  for (const regionType of ['left', 'right', 'between', 'absGreater']) {
    const tool = app().set({ muInput: -13.75, sigmaInput: 2.25, solveMode: 'inverse', regionType, probabilityInput: 0.95 });
    assert.ok(tool.model, tool.el('inputError').textContent);
    const m = tool.model;
    const actualArea = regionType === 'left' ? NormalMath.cdf(m.a) : regionType === 'right' ? NormalMath.sf(m.a) : regionType === 'between' ? NormalMath.interval(m.a, m.b) : NormalMath.cdf(m.a) + NormalMath.sf(m.b);
    close(actualArea, 0.95);
    const expected = [...m.xs, ...m.zs];
    tool.formulaValues().forEach(({ value }, i) => close(value, expected[i]));
    tool.change('solveMode', 'probability');
    close(tool.model.p, 0.95);
  }
});

test('full-precision original inputs remain in copyable formulas', () => {
  const tool = app().set({ muInput: -2.123456789, sigmaInput: 0.987654321, aInput: -1.3456789123 });
  assert.ok(tool.el('excelFormulas').innerHTML.includes('-1.3456789123'));
  assert.ok(tool.el('excelFormulas').innerHTML.includes('-2.123456789'));
  assert.ok(tool.el('excelFormulas').innerHTML.includes('0.987654321'));
  for (const { value } of tool.formulaValues()) close(value, tool.model.p);
});

test('invalid model values hide the previous answer instead of leaving stale results', () => {
  for (const values of [
    { muInput: '' }, { muInput: 'Infinity' }, { sigmaInput: '' }, { sigmaInput: 0 }, { sigmaInput: -1 },
    { aInput: '' }, { aInput: 'NaN' }, { regionType: 'between', aInput: 2, bInput: 1 },
    { regionType: 'absGreater', aInput: -1 },
    { solveMode: 'inverse', probabilityInput: 0 }, { solveMode: 'inverse', probabilityInput: 1 },
    { solveMode: 'inverse', probabilityInput: '' },
  ]) {
    const tool = app().set(values);
    assert.equal(tool.model, null, JSON.stringify(values));
    assert.equal(tool.el('results').hidden, true);
    assert.equal(tool.el('normalSvg').hidden, true);
    assert.equal(tool.el('normalSvg').style.display, 'none');
    assert.equal(tool.el('inputError').hidden, false);
    assert.ok(tool.el('inputError').textContent);
  }
});

test('graph dragging a raw-value cutoff changes z and converts back with mu and sigma', () => {
  const tool = app().set({ muInput: -20, sigmaInput: 5, aInput: -15 });
  const svg = tool.el('normalSvg');
  svg.dispatch('pointerdown', { clientX: tool.run('toX(1)'), clientY: 295, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: tool.run('toX(2)'), clientY: 295, pointerId: 1 });
  close(tool.model.a, 2);
  close(tool.model.xs[0], -10);
  close(Number(tool.el('aInput').value), -10);
  svg.dispatch('pointerup', { pointerId: 1 });
});

test('inverse graph dragging keeps a central interval symmetric around mu', () => {
  const tool = app().set({ muInput: -20, sigmaInput: 5, solveMode: 'inverse', regionType: 'between', probabilityInput: 0.95 });
  const svg = tool.el('normalSvg');
  svg.dispatch('pointerdown', { clientX: tool.run('toX(current.b)'), clientY: 295, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: tool.run('toX(1)'), clientY: 295, pointerId: 1 });
  close(tool.model.a, -1);
  close(tool.model.b, 1);
  close(tool.model.p, NormalMath.interval(-1, 1));
  close(tool.model.xs[0], -25);
  close(tool.model.xs[1], -15);
  svg.dispatch('pointerup', { pointerId: 1 });
});

test('holding a dragged cutoff at one screen coordinate does not expand its z value', () => {
  const tool = app().set({ muInput: 0, sigmaInput: 1, inputScale: 'z', aInput: 2 });
  const svg = tool.el('normalSvg');
  svg.dispatch('pointerdown', { clientX: tool.run('toX(2)'), clientY: 295, pointerId: 1 });
  const screenX = tool.run('toX(3.75)');
  for (let i = 0; i < 4; i += 1) svg.dispatch('pointermove', { clientX: screenX, clientY: 295, pointerId: 1 });
  close(tool.model.a, 3.75);
  svg.dispatch('pointerup', { pointerId: 1 });
});

test('extreme inverse tails emit formulas equivalent to their stable app cutoffs', () => {
  for (const [regionType, probabilityInput] of [['right', 1e-12], ['between', 1 - 1e-12], ['absGreater', 1e-12]]) {
    const tool = app().set({ muInput: 100, sigmaInput: 15, solveMode: 'inverse', regionType, probabilityInput });
    assert.ok(tool.model, tool.el('inputError').textContent);
    const expected = [...tool.model.xs, ...tool.model.zs];
    tool.formulaValues().forEach(({ value, formula }, i) => {
      assert.ok(Math.abs(value - expected[i]) <= 2e-12, `${formula}: ${value} != ${expected[i]}`);
    });
  }
});

test('forward extreme tails and intervals preserve the nonzero probability in Excel formulas', () => {
  for (const inputScale of ['x', 'z']) {
    for (const regionType of ['right', 'between', 'absGreater']) {
      const z = regionType === 'between' ? 8 : 9;
      const aInput = inputScale === 'z' ? z : regionType === 'absGreater' ? 3 * z : -20 + 3 * z;
      const tool = app().set({ muInput: -20, sigmaInput: 3, inputScale, regionType, aInput, bInput: inputScale === 'z' ? 9 : 7 });
      assert.ok(tool.model.p > 0);
      for (const { value } of tool.formulaValues()) close(value, tool.model.p, 0, 2e-13);
    }
  }
});

test('close boundaries stay distinguishable and near-one probabilities are not shown as one', () => {
  const tool = app().set({ muInput: 100, sigmaInput: 1, regionType: 'between', aInput: 100.000001, bInput: 100.000002 });
  assert.ok(tool.el('questionText').textContent.includes('100.000001'));
  assert.ok(tool.el('questionText').textContent.includes('100.000002'));
  assert.equal(Number(tool.run('prob(1-1e-14)')), 1 - 1e-14);
});

test('central inverse probabilities that collapse both cutoffs report a precision error', () => {
  const tool = app().set({ solveMode: 'inverse', regionType: 'between', probabilityInput: 1e-18 });
  assert.equal(tool.model, null);
  assert.equal(tool.el('inputError').hidden, false);
  assert.ok(tool.el('inputError').textContent);
});
