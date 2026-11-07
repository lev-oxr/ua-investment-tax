import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metrics, median } from '../../site/core/analytics/metrics.js';

// Пара з потрібним відсотком результату: cost = 100
const trip = (ret, days = 10, currency = 'USD') => ({
  symbol: 'AAPL',
  currency,
  entry: '2025-01-01',
  exit: '2025-01-11',
  qty: 1,
  cost: 100,
  proceeds: 100 + ret * 100,
  result: ret * 100,
  ret,
  days,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

test('частка прибуткових, середні, відношення й очікування', () => {
  const m = metrics([trip(0.1, 3), trip(0.3, 40), trip(-0.05, 100), trip(-0.15, 200), trip(0, 5)]);
  assert.deepEqual([m.n, m.wins, m.losses], [5, 2, 2]);
  near(m.winRate, 0.4);
  near(m.avgWin, 0.2);
  near(m.avgLoss, -0.1);
  near(m.payoff, 2);
  near(m.expectancy, 0.04); // (0.1 + 0.3 − 0.05 − 0.15 + 0) / 5; нульова угода тягне середнє вниз
  assert.deepEqual([m.days, m.winDays, m.lossDays], [40, 21.5, 150]);
  near(m.total.USD, 20);
});

test('кошики: межі утримання включно, межі результату — у старшому кошику', () => {
  const m = metrics([trip(-0.2, 1), trip(-0.05, 7), trip(0, 8), trip(0.2, 365), trip(0.05, 366)]);
  assert.deepEqual(
    m.hold.map((b) => b.count),
    [1, 1, 1, 0, 1, 1],
  );
  assert.deepEqual(
    m.returns.map((b) => b.count),
    [0, 1, 0, 1, 1, 1, 0, 1],
  );
});

test('без збиткових і без даних — NaN, а не нуль чи Infinity', () => {
  const m = metrics([trip(0.1)]);
  assert.ok(Number.isNaN(m.avgLoss) && Number.isNaN(m.payoff) && Number.isNaN(m.lossDays));
  const empty = metrics([]);
  assert.equal(empty.n, 0);
  assert.ok(Number.isNaN(empty.winRate) && Number.isNaN(empty.expectancy) && Number.isNaN(empty.days));
});

test('купівля за нульовою ціною не йде у відсотки, але йде в суму', () => {
  const free = { ...trip(0), cost: 0, result: 50, ret: NaN };
  const m = metrics([trip(0.1), free]);
  assert.equal(m.n, 1);
  near(m.total.USD, 60);
});

test('медіана', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
