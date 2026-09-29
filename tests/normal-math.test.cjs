'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const normal = require('../normal-math.js');

function close(actual, expected, absolute = 3e-15, relative = 0) {
  const tolerance = Math.max(absolute, relative * Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`);
}

// Independent references: Python 3.12's math.erfc(z / sqrt(2)) / 2 and
// statistics.NormalDist().inv_cdf(p) (Wichura AS241). References deliberately
// include values around the implementation's series/continued-fraction join.
// https://docs.python.org/3/library/math.html#math.erfc
// https://docs.python.org/3/library/statistics.html#statistics.NormalDist.inv_cdf
const tailReferences = [
  [0, 0.5],
  [0.5, 0.30853753872598694],
  [1, 0.15865525393145707],
  [1.6448536269514722, 0.050000000000000072],
  [Math.sqrt(3), 0.041632258331775217],
  [1.96, 0.024997895148220435],
  [2, 0.022750131948179216],
  [2.5758293035489004, 0.0050000000000000096],
  [3, 0.0013498980316300959],
  [4, 3.1671241833119965e-5],
  [5, 2.8665157187919455e-7],
  [7, 1.279812543885835e-12],
  [8, 6.2209605742718194e-16],
  [10, 7.6198530241605945e-24],
];

test('CDF and survival match independent normal probability references', () => {
  for (const [z, tail] of tailReferences) {
    close(normal.sf(z), tail, 0, 2e-14);
    close(normal.cdf(-z), tail, 0, 2e-14);
    close(normal.cdf(z), 1 - tail);
    close(normal.sf(-z), 1 - tail);
  }
  // A survival function must retain a tail even when the CDF rounds to 1.
  assert.equal(normal.cdf(10), 1);
  assert.ok(normal.sf(10) > 0);
});

test('inverse matches classroom and extreme reference quantiles', () => {
  const cases = [
    [1e-12, -7.0344838253011321],
    [1e-9, -5.9978070150076865],
    [1e-6, -4.7534243088228987],
    [0.001, -3.0902323061678132],
    [0.025, -1.9599639845400538],
    [0.05, -1.6448536269514726],
    [0.1, -1.2815515655446008],
    [0.25, -0.67448975019608171],
    [0.5, 0],
    [0.75, 0.67448975019608171],
    [0.9, 1.2815515655446008],
    [0.95, 1.6448536269514715],
    [0.975, 1.9599639845400536],
    [0.999, 3.0902323061678132],
    // This differs from -inv(1e-12) because 1-1e-12 is a binary float.
    [1 - 1e-12, 7.0344869100478356],
  ];
  for (const [p, z] of cases) close(normal.inv(p), z, 5e-14);
});

test('symmetry, monotonicity, and inverse round trips hold across the curve', () => {
  let previousCDF = -1;
  for (let i = -160; i <= 160; i += 1) {
    const z = i / 20;
    const probability = normal.cdf(z);
    assert.ok(probability >= previousCDF);
    previousCDF = probability;
    assert.equal(normal.cdf(-z), normal.sf(z));
    close(normal.cdf(z) + normal.sf(z), 1, Number.EPSILON);
    close(normal.pdf(-z), normal.pdf(z), 0);
    // Round-trip the small tail so subtraction from 1 cannot lose precision.
    const quantile = z <= 0 ? normal.inv(normal.cdf(z)) : -normal.inv(normal.sf(z));
    close(quantile, z, 3e-14);
  }
  for (const p of [1e-12, 1e-9, 1e-6, 0.025, 0.1, 0.49, 0.4999999999999999]) {
    close(normal.cdf(normal.inv(p)), p, 0, 2e-14);
  }
  const nearHalf = 0.5 - Number.EPSILON / 2;
  close(normal.inv(nearHalf), -(0.5 - nearHalf) * Math.sqrt(2 * Math.PI), 0, 1e-14);
});

test('intervals preserve tail areas and handle both sides of the mean', () => {
  close(normal.interval(-1, 1), 0.6826894921370859);
  close(normal.interval(1, 2), 0.13590512198327787);
  close(normal.interval(7, 8), 1.2791904478284077e-12, 0, 2e-14);
  close(normal.interval(8, 9), 6.2198319858658659e-16, 0, 2e-14);
  close(normal.interval(-9, -8), normal.interval(8, 9), 0);
  assert.equal(normal.interval(2, 2), 0);
  assert.equal(normal.interval(-Infinity, Infinity), 1);
  assert.equal(normal.interval(-Infinity, 1), normal.cdf(1));
  assert.equal(normal.interval(1, Infinity), normal.sf(1));
});

test('narrow intervals remain positive and agree with their local density', () => {
  for (const z of [-8, -1, 0, 1, 8]) {
    const width = 1e-10;
    const a = z - width / 2;
    const b = z + width / 2;
    close(normal.interval(a, b), normal.pdf(z) * (b - a), 0, 2e-14);
  }
  // Additivity also checks that the narrow-interval branch matches the CDF.
  close(normal.interval(1, 1.0001) + normal.interval(1.0001, 2), normal.interval(1, 2));
});

test('density and infinite limits have their mathematical values', () => {
  close(normal.pdf(0), 0.3989422804014327, 0);
  close(normal.pdf(1), 0.24197072451914337, 0, 2e-15);
  assert.equal(normal.cdf(-Infinity), 0);
  assert.equal(normal.cdf(Infinity), 1);
  assert.equal(normal.sf(-Infinity), 1);
  assert.equal(normal.sf(Infinity), 0);
  assert.equal(normal.pdf(-Infinity), 0);
  assert.equal(normal.pdf(Infinity), 0);
});

test('invalid values and inverse endpoints are rejected', () => {
  for (const invalid of [NaN, undefined, null, '1', {}, []]) {
    for (const name of ['cdf', 'sf', 'pdf', 'inv']) {
      assert.throws(() => normal[name](invalid), TypeError);
    }
    assert.throws(() => normal.interval(invalid, 1), TypeError);
    assert.throws(() => normal.interval(0, invalid), TypeError);
  }
  for (const invalid of [-Infinity, -1, 0, 1, 2, Infinity]) {
    assert.throws(() => normal.inv(invalid), RangeError);
  }
  assert.throws(() => normal.interval(2, 1), RangeError);
});

test('classic browser script exports the same frozen API without CommonJS', () => {
  const browser = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, '../normal-math.js'), 'utf8');
  vm.runInContext(source, browser);
  assert.deepEqual(Object.keys(browser.NormalMath), ['cdf', 'sf', 'pdf', 'inv', 'interval']);
  assert.ok(Object.isFrozen(browser.NormalMath));
  close(browser.NormalMath.cdf(1.96), normal.cdf(1.96), 0);
});
