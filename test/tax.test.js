import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totals, yearly, militaryRate } from '../site/core/tax.js';
import { LAW, lawUrl } from '../site/core/law.js';

const row = (date, result) => ({ date, result, income: 0, expense: 0 });

test('збиток переноситься 2023 → 2024 → 2025 до повного погашення', () => {
  const y = yearly([row('2023-05-01', -1000), row('2024-03-01', 400), row('2025-02-01', 900), row('2025-07-01', -100)]);
  assert.deepEqual(Object.keys(y), ['2023', '2024', '2025']);
  assert.deepEqual([y['2023'].base, y['2023'].lossOut], [0, 1000]);
  assert.deepEqual([y['2024'].lossIn, y['2024'].base, y['2024'].lossOut], [1000, 0, 600]);
  assert.equal(y['2025'].result, 800); // збиток у межах року зменшує прибуток того ж року
  assert.deepEqual([y['2025'].lossIn, y['2025'].base, y['2025'].lossOut], [600, 200, 0]);
  assert.equal(y['2025'].pdfo, 36);
  assert.equal(y['2025'].military, 10);
});

test('без перенесення: кожен рік рахується лише зі своїх продажів', () => {
  const rows = [row('2023-05-01', -1000), row('2024-03-01', 400), row('2025-02-01', 900), row('2025-07-01', -100)];
  const y = yearly(rows, { carryLoss: false });
  assert.deepEqual([y['2024'].lossIn, y['2024'].base], [0, 400]);
  assert.deepEqual([y['2025'].lossIn, y['2025'].base, y['2025'].pdfo], [0, 800, 144]);
  assert.equal(y['2023'].lossOut, 1000); // власний збиток року все одно показується
});

test('рядки в довільному порядку — роки все одно по порядку', () => {
  const y = yearly([row('2025-02-01', 500), row('2024-03-01', -300)]);
  assert.deepEqual(Object.keys(y), ['2024', '2025']);
  assert.equal(y['2025'].base, 200);
});

test('продажі без купівель (missing) у підсумок не йдуть', () => {
  const t = totals(
    [row('2025-01-01', 1000), { ...row('2025-02-01', 0), income: 5000, expense: 100, missing: 0.3 }],
    0,
    2025,
  );
  assert.deepEqual([t.income, t.expense, t.result, t.base], [0, 0, 1000, 1000]);
});

test('ставки: ПДФО 18%, військовий збір 1,5% до 2024 року і 5% з 2024-го', () => {
  assert.equal(militaryRate(2023), 0.015);
  assert.equal(militaryRate('2024'), 0.05);
  const r = [row('2023-01-01', 1000)];
  assert.deepEqual([totals(r, 0, '2023').pdfo, totals(r, 0, '2023').military], [180, 15]);
  assert.equal(totals(r, 0, 2025).military, 50);
});

test("від'ємний результат не дає податку й не дає від'ємної бази", () => {
  const t = totals([row('2025-01-01', -250.5)], 0, 2025);
  assert.deepEqual([t.base, t.pdfo, t.military, t.lossOut], [0, 0, 0, 250.5]);
});

test('копійки: суми округлено', () => {
  const t = totals([row('2025-01-01', 0.1), row('2025-01-02', 0.2), row('2025-01-03', 1234.56)], 0, 2025);
  assert.equal(t.result, 1234.86);
  assert.equal(t.pdfo, 222.27); // 1234.86 × 0.18 = 222.2748
  assert.equal(t.military, 61.74); // 1234.86 × 0.05 = 61.743
});

test('довідник ПКУ: кожен пункт має якір і підпис', () => {
  for (const [key, { anchor, label }] of Object.entries(LAW)) {
    assert.match(anchor, /^n\d+$/, key);
    assert.ok(label, key);
  }
  assert.equal(lawUrl('pdfo'), 'https://zakon.rada.gov.ua/laws/show/2755-17#n11196');
});
