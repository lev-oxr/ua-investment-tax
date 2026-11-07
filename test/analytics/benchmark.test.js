import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrices, benchmark } from '../../site/core/analytics/benchmark.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);
const trip = (entry, exit, ret) => ({ entry, exit, ret, symbol: 'AAPL', currency: 'USD', cost: 100 });

test('Yahoo: береться Adj Close, рядки сортуються, порожні й null пропускаються', () => {
  const csv =
    '\uFEFFDate,Open,High,Low,Close,Adj Close,Volume\n2025-01-03,1,1,1,500,490,1\n2025-01-02,1,1,1,null,null,1\n\n2025-01-01,1,1,1,480,470,1';
  assert.deepEqual(parsePrices(csv), [
    ['2025-01-01', 470],
    ['2025-01-03', 490],
  ]);
});

test('Nasdaq: дати MM/DD/YYYY і ціни з $', () => {
  const csv = 'Date,Close/Last,Volume,Open,High,Low\n01/03/2025,$591.95,1,$1,$1,$1\n01/02/2025,"$1,584.64",1,$1,$1,$1';
  assert.deepEqual(parsePrices(csv), [
    ['2025-01-02', 1584.64],
    ['2025-01-03', 591.95],
  ]);
});

test('без стовпців Date і Close — зрозуміла помилка', () => {
  assert.throws(() => parsePrices('Symbol,Price\nSPY,500'), /Date і Close/);
  assert.throws(() => parsePrices('Date,Close\n'), /жодного рядка/);
});

test('угода проти індексу за той самий період; вихідний день — останнє закриття до нього', () => {
  const prices = [
    ['2025-01-02', 100],
    ['2025-01-03', 110], // п'ятниця
    ['2025-01-06', 120],
  ];
  const b = benchmark(
    [
      trip('2025-01-02', '2025-01-05', 0.2), // неділя → 110: індекс +10%, угода краща на 10 п.п.
      trip('2025-01-03', '2025-01-06', 0), // індекс +9,09%
      trip('2025-01-01', '2025-01-06', 0.5), // до початку файлу цін
      trip('2025-01-02', '2025-01-07', 0.5), // після кінця
      trip('2025-01-02', '2025-01-03', NaN), // нульова собівартість
    ],
    prices,
  );
  assert.deepEqual([b.n, b.skipped, b.from, b.to], [2, 3, '2025-01-02', '2025-01-06']);
  near(b.beat, 0.5);
  near(b.excess, (0.1 + (0 - 120 / 110 + 1)) / 2);
});
