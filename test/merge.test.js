import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFiles } from '../site/core/brokers/index.js';

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
