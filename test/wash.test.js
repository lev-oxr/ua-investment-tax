import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fifo } from '../site/core/fifo.js';
import { markWash } from '../site/core/wash.js';

const trade = (date, type, qty, price, symbol = 'X', time = '') => ({
  date,
  time,
  type,
  symbol,
  qty,
  price,
  currency: 'USD',
  fee: 0,
});
const wash = (trades) =>
  markWash(
    fifo(trades, () => 1),
    trades,
  ).map((r) => r.wash.map((w) => w.date));

test('30 днів: купівля через 15 днів після збиткового продажу — так', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 10, 100),
    trade('2025-03-10', 'SELL', 10, 80),
    trade('2025-03-25', 'BUY', 10, 85),
  ];
  assert.deepEqual(wash(trades), [['2025-03-25']]);
});

test('30 днів: купівля через 31 день — ні', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 10, 100),
    trade('2025-03-10', 'SELL', 10, 80),
    trade('2025-04-10', 'BUY', 10, 85),
  ];
  assert.deepEqual(wash(trades), [[]]);
});

test('30 днів: той самий пакет, проданий повністю, — ні', () => {
  assert.deepEqual(wash([trade('2025-03-01', 'BUY', 10, 100), trade('2025-03-10', 'SELL', 10, 80)]), [[]]);
});

test('30 днів: частковий продаж — решта тієї ж купівлі позначається', () => {
  assert.deepEqual(wash([trade('2025-03-01', 'BUY', 10, 100), trade('2025-03-10', 'SELL', 5, 80)]), [['2025-03-01']]);
});

test('30 днів: прибутковий продаж — ні', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 10, 100),
    trade('2025-03-10', 'SELL', 10, 120),
    trade('2025-03-12', 'BUY', 1, 90),
  ];
  assert.deepEqual(wash(trades), [[]]);
});

test('30 днів: інший тікер — ні', () => {
  const trades = [
    trade('2025-01-10', 'BUY', 10, 100),
    trade('2025-03-10', 'SELL', 10, 80),
    trade('2025-03-12', 'BUY', 1, 90, 'Y'),
  ];
  assert.deepEqual(wash(trades), [[]]);
});

test('30 днів: частини одного ордера — один пакет', () => {
  const parts = (t1, t2) => [
    trade('2025-02-20', 'BUY', 6, 100),
    trade('2025-02-20', 'BUY', 4, 100),
    trade('2025-03-01', 'SELL', 6, 80, 'X', t1),
    trade('2025-03-01', 'SELL', 4, 80, 'X', t2),
  ];
  assert.deepEqual(wash(parts('15:57:06', '15:57:06')), [[], []]);
  // для контролю: різний час — це вже два пакети, і кожен бачить купівлю, яку списав інший
  assert.deepEqual(wash(parts('10:00:00', '15:57:06')), [['2025-02-20'], ['2025-02-20']]);
});
