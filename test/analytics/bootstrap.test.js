import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, rng } from '../../site/core/analytics/bootstrap.js';

const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const range = (n, from = 0) => Array.from({ length: n }, (_, i) => from + i);

test('генератор детермінований і в [0, 1)', () => {
  const a = rng(42);
  const b = rng(42);
  const xs = range(1000).map(() => a());
  assert.deepEqual(
    xs.slice(0, 5),
    range(5).map(() => b()),
  );
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.ok(Math.abs(mean(xs) - 0.5) < 0.03);
});

test('той самий seed — той самий інтервал, інший seed — інший', () => {
  const xs = range(50);
  assert.deepEqual(bootstrap([xs], mean), bootstrap([xs], mean));
  assert.notDeepEqual(bootstrap([xs], mean), bootstrap([xs], mean, { seed: 2 }));
});

test('середнє 0…99: 90% інтервал ≈ 49,5 ± 1,645 × 2,9', () => {
  const [lo, hi] = bootstrap([range(100)], mean);
  assert.ok(lo > 44 && lo < 47, `lo ${lo}`);
  assert.ok(hi > 52 && hi < 55, `hi ${hi}`);
  // ширший рівень — ширший інтервал
  const [lo99, hi99] = bootstrap([range(100)], mean, { level: 0.99 });
  assert.ok(lo99 < lo && hi99 > hi);
});

test('сталі дані — інтервал у точку; порожня вибірка — NaN', () => {
  assert.deepEqual(bootstrap([[3, 3, 3]], mean), [3, 3]);
  assert.ok(bootstrap([[1], []], (a, b) => mean(a) - mean(b)).every(Number.isNaN));
});

test('дві вибірки перевибираються окремо: різниця середніх', () => {
  const [lo, hi] = bootstrap([range(100, 100), range(100)], (a, b) => mean(a) - mean(b));
  assert.ok(lo > 90 && hi < 110 && lo < 100 && hi > 100, `${lo}…${hi}`);
});
