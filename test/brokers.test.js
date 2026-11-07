import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile } from '../site/core/brokers/index.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('Activity: ордери акцій без ClosedLot і підсумків, Forex і корпоративні дії — у попередженнях', () => {
  const { format, trades, warnings } = parseFile(fixture('ibkr-activity.csv'));
  assert.equal(format, 'ibkr-activity');
  assert.deepEqual(trades, [
    {
      date: '2025-01-15',
      time: '10:31:02',
      type: 'BUY',
      symbol: 'MSFT',
      qty: 1000,
      price: 421.5,
      currency: 'USD',
      fee: 5,
    },
    {
      date: '2025-08-12',
      time: '15:02:44',
      type: 'SELL',
      symbol: 'MSFT',
      qty: 400,
      price: 522,
      currency: 'USD',
      fee: 2.5,
    },
  ]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Forex.*1/);
  assert.match(warnings[1], /корпоративні дії \(1\)/);
});

test('Flex: береться EXECUTION, а не ORDER; опціон і валюта — у попередженнях', () => {
  const { format, trades, warnings } = parseFile(fixture('ibkr-flex-levels.csv'));
  assert.equal(format, 'ibkr-flex');
  assert.deepEqual(
    trades.map((t) => [t.date, t.time, t.type, t.qty, t.price, t.fee, t.exchange]),
    [
      ['2025-03-03', '09:30:01', 'BUY', 6, 230.5, 0.35, 'NASDAQ'],
      ['2025-03-03', '09:30:02', 'BUY', 4, 230.6, 0.35, 'ARCA'],
      ['2025-03-10', '15:00:00', 'SELL', 3, 240, 0.35, 'IBKR'],
    ],
  );
  assert.deepEqual(warnings, [
    'Пропущено угод класу «OPT»: 1. Інструмент рахує лише STK.',
    'Пропущено угод класу «CASH»: 1. Інструмент рахує лише STK.',
  ]);
});

test('Flex: лише ORDER, префікси HEADER/DATA, дата MM/dd/yyyy, без Exchange', () => {
  const { format, trades, warnings } = parseFile(fixture('ibkr-flex-sections.csv'));
  assert.equal(format, 'ibkr-flex');
  assert.deepEqual(
    trades.map((t) => [t.date, t.type, t.symbol, t.qty, t.currency, t.fee]),
    [
      ['2025-03-04', 'BUY', 'VOO', 2, 'USD', 1],
      ['2025-06-10', 'SELL', 'SAP', 1, 'EUR', 3],
    ],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Exchange/);
});

test('власний CSV: розбирається, BOM не заважає', () => {
  const { format, trades, warnings } = parseFile('\uFEFF' + fixture('generic.csv'));
  assert.equal(format, 'generic');
  assert.equal(trades.length, 5);
  assert.deepEqual(trades[0], {
    date: '2024-03-04',
    time: '',
    type: 'BUY',
    symbol: 'VOO',
    qty: 5,
    price: 470.1,
    currency: 'USD',
    fee: 1,
  });
  assert.deepEqual(warnings, []);
});

test('власний CSV: кривий рядок — помилка з номером рядка', () => {
  const text = 'date,type,symbol,qty,price,currency\n2025-01-10,BUY,AAPL,1,100,USD\n\n2025-01-11,HOLD,AAPL,1,100,USD';
  assert.throws(() => parseFile(text), /Рядок 4 не розібрано/);
});

test('власний CSV: немає обов’язкових колонок — перелік у помилці', () => {
  assert.throws(() => parseFile('date,symbol,qty\n2025-01-10,AAPL,1'), /немає колонок type, price, currency/);
});
