/* Standard normal probabilities, shared by the browser and Node tests.
 *
 * The central integral uses the convergent incomplete-gamma series; tails use
 * the continued fraction for Q(1/2, z*z/2), evaluated with modified Lentz steps.
 * These are mathematical identities, implemented here without dependencies:
 * https://dlmf.nist.gov/8.7.E1 and https://dlmf.nist.gov/8.9.E2
 * Inverting the directly evaluated small tail avoids cancellation near p=1.
 */
(function (root) {
  'use strict';

  const INV_SQRT_TWO_PI = 1 / Math.sqrt(2 * Math.PI);
  const SERIES_LIMIT = Math.sqrt(3);
  const EPSILON = Number.EPSILON;

  function requireNumber(value, name) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new TypeError(`${name} must be a number.`);
    }
  }

  function density(z) {
    return INV_SQRT_TWO_PI * Math.exp(-0.5 * z * z);
  }

  // Integral from zero to z, for 0 <= z < sqrt(3). Unlike subtracting two
  // CDFs, this retains the information in very small distances from zero.
  function centralArea(z) {
    let term = z;
    let sum = z;
    const square = z * z;
    for (let denominator = 3; denominator < 201; denominator += 2) {
      term *= square / denominator;
      const next = sum + term;
      if (next === sum) break;
      sum = next;
    }
    return density(z) * sum;
  }

  // P(Z > z) for nonnegative z. The small tail is calculated directly.
  function positiveTail(z) {
    if (z < SERIES_LIMIT) return 0.5 - centralArea(z);
    if (z >= 39) return 0; // The result is below Number.MIN_VALUE.

    const x = 0.5 * z * z;
    let denominator = x + 0.5;
    let c = 1e300;
    let d = 1 / denominator;
    let fraction = d;
    for (let i = 1; i <= 1000; i += 1) {
      const numerator = -i * (i - 0.5);
      denominator += 2;
      d = denominator + numerator * d;
      c = denominator + numerator / c;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const change = d * c;
      fraction *= change;
      if (Math.abs(change - 1) <= 2 * EPSILON) break;
    }
    return (density(z) * z * 0.5) * fraction;
  }

  function pdf(z) {
    requireNumber(z, 'z');
    return density(z);
  }

  function cdf(z) {
    requireNumber(z, 'z');
    return z < 0 ? positiveTail(-z) : 1 - positiveTail(z);
  }

  function sf(z) {
    requireNumber(z, 'z');
    return z < 0 ? 1 - positiveTail(-z) : positiveTail(z);
  }

  function inv(p) {
    requireNumber(p, 'p');
    if (!(p > 0 && p < 1)) {
      throw new RangeError('p must be greater than 0 and less than 1.');
    }
    if (p === 0.5) return 0;

    const tail = Math.min(p, 1 - p);
    const central = 0.5 - tail;
    let lower = 0;
    // Chernoff's bound supplies a finite upper bracket for every valid p.
    let upper = Math.sqrt(-2 * Math.log(tail));
    if (tail > 0.25) upper = Math.min(upper, central / density(upper));
    for (let i = 0; i < 80; i += 1) {
      const middle = lower + (upper - lower) * 0.5;
      if (middle === lower || middle === upper) break;
      // Close to p=0.5, compare central areas without subtracting from 0.5.
      const below = tail > 0.25
        ? centralArea(middle) < central
        : positiveTail(middle) > tail;
      if (below) lower = middle;
      else upper = middle;
    }
    const z = lower + (upper - lower) * 0.5;
    return p < 0.5 ? -z : z;
  }

  function interval(a, b) {
    requireNumber(a, 'a');
    requireNumber(b, 'b');
    if (a > b) throw new RangeError('The lower endpoint must not exceed the upper endpoint.');
    if (a === b) return 0;
    if (a === -Infinity) return cdf(b);
    if (b === Infinity) return sf(a);

    const width = b - a;
    const middle = a + width * 0.5;
    // Four-point Gauss-Legendre integration avoids subtracting almost equal
    // tail probabilities for narrow intervals. This small-width criterion
    // keeps quadrature error below floating-point rounding error.
    if (width * (1 + Math.abs(middle)) < 0.01) {
      const half = width * 0.5;
      const inner = half * 0.3399810435848563;
      const outer = half * 0.8611363115940526;
      return half * (
        0.6521451548625461 * (density(middle - inner) + density(middle + inner)) +
        0.3478548451374538 * (density(middle - outer) + density(middle + outer))
      );
    }
    if (a >= 0) return Math.max(0, positiveTail(a) - positiveTail(b));
    if (b <= 0) return Math.max(0, positiveTail(-b) - positiveTail(-a));
    return Math.max(0, 1 - positiveTail(-a) - positiveTail(b));
  }

  const api = Object.freeze({ cdf, sf, pdf, inv, interval });
  root.NormalMath = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
