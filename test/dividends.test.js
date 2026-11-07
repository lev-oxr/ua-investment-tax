import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividendRows, dividendTotals } from '../site/core/dividends.js';

const cash = (date, symbol, amount, type = 'DIV', currency = 'USD') => ({ date, symbol, currency, amount, type });
const rates = { '2026-03-13': 41.2, '2026-06-12': 41.5, '2026-09-10': 42, '2025-12-10': 40 };
const rate = (c, d) => (c === 'UAH' ? 1 : rates[d]);

test('податок прив’язується до виплати того дня; курс — на дату виплати', () => {
  const rows = dividendRows(
    [
      cash('2026-03-13', 'MSFT', 8.3),
      cash('2026-03-13', 'MSFT', -1.25, 'WHT'),
      cash('2026-03-13', 'AAPL', 2.5),
      cash('2026-06-12', 'MSFT', 0.83, 'LIEU'),
      cash('2026-06-12', 'MSFT', -0.12, 'WHT'), // лише виплата замість дивіденду цього дня
      cash('2026-09-10', 'MSFT', 0.1, 'WHT'), // повернення податку окремим днем
    ],
    rate,
  );
  assert.deepEqual(
    rows.map((r) => [r.date, r.symbol, r.type, r.gross, r.withheld, r.income, r.withheldUah]),
    [
      ['2026-03-13', 'MSFT', 'DIV', 8.3, 1.25, 341.96, 51.5],
      ['2026-03-13', 'AAPL', 'DIV', 2.5, 0, 103, 0],
      ['2026-06-12', 'MSFT', 'LIEU', 0.83, 0.12, 34.45, 4.98],
      ['2026-09-10', 'MSFT', 'DIV', 0, -0.1, 0, -4.2],
    ],
  );
});

test('рік: 9% з дивідендів, 18% з виплат замість дивідендів, 5% збору з усього', () => {
  const rows = dividendRows(
    [
      cash('2026-03-13', 'MSFT', 100),
      cash('2026-03-13', 'MSFT', -15, 'WHT'),
      cash('2026-06-12', 'MSFT', 10, 'LIEU'),
      cash('2025-12-10', 'MSFT', 50), // інший рік
    ],
    rate,
  );
  const t = dividendTotals(rows, '2026');
  assert.equal(t.income, 4120 + 415);
  assert.equal(t.pdfo, Math.round((4120 * 0.09 + 415 * 0.18) * 100) / 100); // 370,8 + 74,7
  assert.equal(t.milRate, 0.05);
  assert.equal(t.military, 226.75);
  assert.equal(t.withheldUah, 618);
});

test('сторно більше за виплати — податку немає, а не від’ємний', () => {
  const rows = dividendRows([cash('2026-03-13', 'X', 5), cash('2026-06-12', 'X', -6)], rate);
  assert.deepEqual(dividendTotals(rows, '2026'), { income: 0, pdfo: 0, milRate: 0.05, military: 0, withheldUah: 0 });
});

test('немає курсу — помилка', () => {
  assert.throws(() => dividendRows([cash('2026-01-01', 'X', 1)], rate), /USD на 2026-01-01/);
});
