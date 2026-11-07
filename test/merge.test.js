import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeFiles, parseFile } from '../site/core/brokers/index.js';
import { applySplits } from '../site/core/brokers/corporate.js';
import { fifo } from '../site/core/fifo.js';

const t = (date, qty = 1) => ({ date, time: '', type: 'BUY', symbol: 'X', qty, price: 10, currency: 'USD', fee: 0 });
const file = (name, format, trades, warnings = []) => ({ name, format, trades, warnings });

test('дублікати між файлами відкидаються, а всередині файлу — ні', () => {
  const { trades, warnings } = mergeFiles([
    file('2024.csv', 'generic', [t('2024-12-30'), t('2024-12-30')]),
    file('2025.csv', 'generic', [t('2024-12-30'), t('2025-01-02')], ['щось пропущено']),
  ]);
  assert.equal(trades.length, 3);
  assert.deepEqual(warnings, [
    '2025.csv: щось пропущено',
    'Пропущено дублікатів угод: 1. Виписки перекриваються за датами.',
  ]);
});

test('Activity і Flex за той самий період — помилка', () => {
  const parsed = [
    file('a.csv', 'ibkr-activity', [t('2025-01-10'), t('2025-06-01')]),
    file('f.csv', 'ibkr-flex', [t('2025-05-01')]),
  ];
  assert.throws(() => mergeFiles(parsed), /перекриваються за датами/);
});

test('Activity і Flex за різні роки — можна', () => {
  const parsed = [file('a.csv', 'ibkr-activity', [t('2024-03-01')]), file('f.csv', 'ibkr-flex', [t('2025-05-01')])];
  assert.equal(mergeFiles(parsed).trades.length, 2);
});

test('спліт: угоди до нього перераховуються, і продаж після спліту знаходить купівлю', () => {
  const p = parseFile(readFileSync(new URL('./fixtures/ibkr-flex-cash.csv', import.meta.url), 'utf8'));
  const { trades, cash } = mergeFiles([{ name: 'f.csv', ...p }]);
  assert.deepEqual(
    trades.map((x) => [x.qty, x.price]),
    [
      [20, 80],
      [20, 120],
    ],
  );
  assert.equal(cash.length, 2);
  // собівартість та сама: 2 × 800 + 1 = 20 × 80 + 1
  assert.equal(fifo(trades, () => 1)[0].result, 20 * 120 - 1 - 1601);
});

test('спліти й дивіденди з перекритих виписок — один раз; зворотний спліт і кілька сплітів множаться', () => {
  const div = { date: '2025-03-13', symbol: 'X', currency: 'USD', amount: 5, type: 'DIV' };
  const split = { symbol: 'X', date: '2025-06-09', time: '20:25:00', ratio: 2 };
  const { trades, cash } = mergeFiles([
    { ...file('a.csv', 'generic', [t('2025-01-02', 3)]), cash: [div], splits: [split] },
    { ...file('b.csv', 'generic', []), cash: [div], splits: [split] },
  ]);
  assert.equal(cash.length, 1);
  assert.equal(trades[0].qty, 6);
  const later = [split, { symbol: 'X', date: '2025-09-01', time: '', ratio: 0.1 }];
  const moved = applySplits(
    [t('2025-06-09', 10), { ...t('2025-06-10', 10), time: '09:30:00' }, t('2025-09-01', 10), t('2025-09-02', 10)],
    later,
  );
  assert.deepEqual(
    moved.map((x) => x.qty),
    [2, 1, 1, 10],
  );
  assert.equal(moved[0].price, 10 / 0.2);
});
