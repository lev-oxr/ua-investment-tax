import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fifo } from '../site/core/fifo.js';

const trade = (date, type, qty, price, fee = 0, symbol = 'AAPL') => ({
  date,
  time: '',
  type,
  symbol,
  qty,
  price,
  currency: 'USD',
  fee,
});
const rates = { '2025-01-10': 40, '2025-02-10': 41, '2025-03-10': 42 };
const rate = (_, date) => rates[date];
const r2 = (n) => Math.round(n * 100) / 100;

test("продаж з'їдає перший лот і частину другого", () => {
  const trades = [
    trade('2025-03-10', 'SELL', 15, 120, 2), // у файлі раніше за купівлі: сортування за датою
    trade('2025-01-10', 'BUY', 10, 100, 1),
    trade('2025-02-10', 'BUY', 10, 110),
  ];
  const [row] = fifo(trades, rate);
  assert.equal(row.income, 15 * 120 * 42); // 75 600
  assert.equal(row.expense, 1001 * 40 + 5 * 110 * 41 + 2 * 42); // 40 040 + 22 550 + 84 = 62 674
  assert.equal(row.result, 12926);
  assert.deepEqual(
    row.lots.map((l) => [l.id, l.date, l.qty, l.fee, l.rate, l.cost]),
    [
      [1, '2025-01-10', 10, 1, 40, 40040],
      [2, '2025-02-10', 5, 0, 41, 22550],
    ],
  );
});

test('продаж без купівлі — помилка, а не нульова собівартість', () => {
  assert.throws(() => fifo([trade('2025-03-10', 'SELL', 1, 120)], rate), /куплено менше/);
  // продано більше, ніж куплено
  const trades = [trade('2025-01-10', 'BUY', 1, 100), trade('2025-03-10', 'SELL', 2, 120)];
  assert.throws(() => fifo(trades, rate), /продано 2, а куплено менше/);
});

test('allowMissing: продаж без частини купівель позначається, а знайдені лоти списуються', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 0.6, 100),
    trade('2025-01-10', 'BUY', 0.1, 100),
    trade('2025-02-10', 'BUY', 1, 110),
    trade('2025-03-10', 'SELL', 2, 120), // купівель лише на 1,7
    trade('2025-03-10', 'BUY', 1, 115),
    trade('2025-03-10', 'SELL', 1, 121),
  ];
  const [gap, next] = fifo(trades, rate, { allowMissing: true });
  assert.equal(gap.missing, 0.3);
  assert.equal(gap.result, 0);
  assert.deepEqual(
    gap.lots.map((l) => l.qty),
    [0.6, 0.1, 1],
  );
  // наступний продаж бере нову купівлю, а не вже списані лоти
  assert.deepEqual(
    next.lots.map((l) => [l.date, l.qty]),
    [['2025-03-10', 1]],
  );
  assert.equal(next.missing, undefined);
  assert.equal(next.result, 42 * (121 - 115));
});

test('немає курсу — помилка з валютою й датою', () => {
  assert.throws(() => fifo([trade('2025-04-01', 'BUY', 1, 100)], rate), /USD на 2025-04-01/);
});

test('однакова дата — порядок як у файлі', () => {
  const trades = [trade('2025-01-10', 'BUY', 1, 100), trade('2025-01-10', 'SELL', 1, 101)];
  assert.equal(fifo(trades, rate)[0].result, 40);
});

test('копійки: кожна сума округлена, а деталі лотів сходяться з витратами', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 3, 33.333, 1),
    trade('2025-02-10', 'BUY', 2, 34.567, 0.37),
    trade('2025-03-10', 'SELL', 4, 35.555, 0.77),
  ];
  const odd = { '2025-01-10': 41.2345, '2025-02-10': 41.9876, '2025-03-10': 42.3456 };
  const [row] = fifo(trades, (_, d) => odd[d]);
  for (const v of [row.income, row.expense, row.result, row.feeUah, ...row.lots.map((l) => l.cost)]) {
    assert.equal(v, r2(v), `${v} має бути в копійках`);
  }
  assert.equal(row.expense, r2(row.lots.reduce((a, l) => a + l.cost, 0) + row.feeUah));
  assert.equal(row.result, r2(row.income - row.expense));
});

test('дробові акції: залишок менший за EPS вважається нулем', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 0.1, 100),
    trade('2025-01-10', 'BUY', 0.2, 100),
    trade('2025-03-10', 'SELL', 0.3, 110), // 0.1 + 0.2 = 0.30000000000000004
  ];
  assert.equal(fifo(trades, rate).length, 1);
  assert.throws(() => fifo([...trades, trade('2025-03-10', 'SELL', 0.01, 110)], rate), /куплено менше/);
});

test('за курсу 1: дохід − 40% лота разом з комісією купівлі − комісія продажу', () => {
  const trades = [
    trade('2025-01-15', 'BUY', 1000, 421.5, 5, 'MSFT'),
    trade('2025-08-12', 'SELL', 400, 522, 2.5, 'MSFT'),
  ];
  assert.equal(fifo(trades, () => 1)[0].result, 400 * 522 - (1000 * 421.5 + 5) * 0.4 - 2.5); // 40 195,5
});
