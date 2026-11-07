import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behavior } from '../../site/core/analytics/behavior.js';

const trip = (entry, exit, ret, days = 1) => ({ symbol: 'AAPL', currency: 'USD', entry, exit, cost: 100, ret, days });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);
const by = (slices) => Object.fromEntries(slices.map((s) => [s.label, s]));

test('після збитку й після прибутку: важить остання угода, закрита до дня входу', () => {
  const b = behavior([
    trip('2025-01-06', '2025-01-08', 0.1), // перша — без попередньої
    trip('2025-01-09', '2025-01-10', -0.05), // після прибутку
    trip('2025-01-10', '2025-01-13', 0.02), // угода 2 закрита в день входу — ще прибуток 1
    trip('2025-01-14', '2025-01-15', -0.2), // після прибутку 3 (закрита 13-го, пізніше за 10-те)
    trip('2025-01-16', '2025-01-17', 0.3), // після збитку
  ]);
  const s = by(b.afterLoss);
  assert.deepEqual([s['Після прибутку'].n, s['Після збитку'].n], [3, 1]);
  near(s['Після прибутку'].value, (-0.05 + 0.02 - 0.2) / 3);
  near(s['Після збитку'].value, 0.3);
  near(s['Після збитку − після прибутку'].value, 0.3 - (-0.05 + 0.02 - 0.2) / 3);
  assert.equal(s['Після збитку − після прибутку'].n, 1);
  // одна угода в групі — інтервал у точку
  assert.deepEqual([s['Після збитку'].lo, s['Після збитку'].hi], [0.3, 0.3]);
});

test('день тижня входу: лише дні з угодами, від понеділка', () => {
  const b = behavior([
    trip('2025-01-10', '2025-01-11', 0.1), // п'ятниця
    trip('2025-01-06', '2025-01-07', -0.1), // понеділок
    trip('2025-01-13', '2025-01-14', 0.3), // понеділок
  ]);
  assert.deepEqual(
    b.weekday.map((s) => [s.label, s.n]),
    [
      ['Пн', 2],
      ['Пт', 1],
    ],
  );
  near(b.weekday[0].value, 0.1);
});

test('кошики утримання без порожніх; ефект диспозиції — медіани днів', () => {
  const b = behavior([
    trip('2025-01-06', '2025-01-07', 0.1, 1),
    trip('2025-01-06', '2025-01-07', 0.2, 3),
    trip('2025-01-06', '2025-01-07', -0.1, 40),
    trip('2025-01-06', '2025-01-07', -0.3, 60),
  ]);
  assert.deepEqual(
    b.hold.map((s) => [s.label, s.n]),
    [
      ['0–1 дн.', 1],
      ['2–7 дн.', 1],
      ['31–90 дн.', 2],
    ],
  );
  assert.equal(b.disposition.value, 50 - 2);
  assert.ok(b.disposition.lo > 0, 'збиткові тримаються довше в кожній перевибірці');
  near(b.winRate.value, 0.5);
  near(b.expectancy.value, -0.025);
});

test('нульова собівартість не йде у зрізи; порожні групи — NaN', () => {
  const b = behavior([trip('2025-01-06', '2025-01-07', NaN), trip('2025-01-08', '2025-01-09', 0.1)]);
  assert.equal(b.expectancy.n, 1);
  const s = by(b.afterLoss);
  assert.equal(s['Після прибутку'].n, 0);
  assert.ok(Number.isNaN(s['Після прибутку'].value) && Number.isNaN(s['Після збитку − після прибутку'].lo));
  assert.ok(Number.isNaN(b.disposition.value));
});
