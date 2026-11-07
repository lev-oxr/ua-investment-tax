import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fifo } from '../../site/core/fifo.js';
import { roundtrips, positions } from '../../site/core/analytics/roundtrips.js';

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
// Курс НБУ не впливає на пари: вони у валюті угоди
const pairs = (trades) => roundtrips(fifo(trades, () => 41.5, { allowMissing: true }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('продаж через два лоти — дві пари з власними датами входу й часткою комісій', () => {
  const [a, b] = pairs([
    trade('2025-01-10', 'BUY', 10, 100, 1),
    trade('2025-02-10', 'BUY', 10, 110),
    trade('2025-03-10', 'SELL', 15, 120, 3),
  ]);
  assert.deepEqual([a.entry, a.exit, a.qty, a.days], ['2025-01-10', '2025-03-10', 10, 59]);
  near(a.cost, 1001);
  near(a.proceeds, 10 * 120 - 2); // 2/3 комісії продажу
  near(a.result, 197);
  near(a.ret, 197 / 1001);
  assert.deepEqual([b.entry, b.qty, b.days], ['2025-02-10', 5, 28]);
  near(b.cost, 550);
  near(b.result, 5 * 120 - 1 - 550);
});

test('частковий продаж лота, потім решта — дві пари з того самого входу', () => {
  const rt = pairs([
    trade('2025-01-10', 'BUY', 10, 100, 2),
    trade('2025-01-20', 'SELL', 4, 90),
    trade('2025-04-10', 'SELL', 6, 130),
  ]);
  assert.deepEqual(
    rt.map((r) => [r.entry, r.exit, r.qty, r.days]),
    [
      ['2025-01-10', '2025-01-20', 4, 10],
      ['2025-01-10', '2025-04-10', 6, 90],
    ],
  );
  near(rt[0].result, 4 * 90 - 400.8);
  near(rt[1].result, 6 * 130 - 601.2);
});

test('дробові акції й кілька символів', () => {
  const rt = pairs([
    trade('2025-01-10', 'BUY', 0.1, 500, 0, 'VOO'),
    trade('2025-01-10', 'BUY', 0.2, 510, 0, 'VOO'),
    trade('2025-01-10', 'BUY', 1, 100),
    trade('2025-01-11', 'SELL', 0.3, 520, 0.3, 'VOO'),
    trade('2025-01-11', 'SELL', 1, 99),
  ]);
  assert.deepEqual(
    rt.map((r) => r.symbol),
    ['VOO', 'VOO', 'AAPL'],
  );
  near(rt[1].qty, 0.2); // fifo віднімає float: 0.3 − 0.1
  near(rt[0].result, 0.1 * 520 - 0.1 - 50);
  near(rt[1].result, 0.2 * 520 - 0.2 - 102);
  near(rt[2].result, -1);
  near(
    rt.reduce((a, r) => a + r.result, 0),
    0.3 * 520 - 0.3 - 152 - 1,
  );
});

test('частина продажу без купівлі пари не має', () => {
  const rt = pairs([trade('2025-01-10', 'BUY', 1, 100), trade('2025-02-10', 'SELL', 3, 120, 3)]);
  assert.equal(rt.length, 1);
  near(rt[0].result, 120 - 1 - 100); // лише третина комісії продажу
});

test('позиції: докупівля й часткові продажі — одна позиція, повторний вхід після закриття — нова', () => {
  const ps = positions(
    pairs([
      trade('2025-01-10', 'BUY', 10, 100), // позиція 1
      trade('2025-02-10', 'BUY', 10, 110), // докупівля
      trade('2025-03-10', 'SELL', 15, 120), // частковий продаж: 2 пари
      trade('2025-04-10', 'SELL', 5, 90), // закриття
      trade('2025-05-12', 'BUY', 4, 100), // позиція 2
      trade('2025-05-20', 'SELL', 4, 105),
      trade('2025-01-10', 'BUY', 1, 50, 0, 'VOO'), // інший тікер у той самий час
      trade('2025-04-10', 'SELL', 1, 55, 0, 'VOO'),
    ]),
  );
  assert.deepEqual(
    ps.map((p) => [p.symbol, p.entry, p.exit, p.qty]),
    [
      ['AAPL', '2025-01-10', '2025-04-10', 20],
      ['AAPL', '2025-05-12', '2025-05-20', 4],
      ['VOO', '2025-01-10', '2025-04-10', 1],
    ],
  );
  const [a] = ps;
  near(a.cost, 1000 + 1100);
  near(a.result, 15 * 120 + 5 * 90 - 2100);
  near(a.ret, a.result / 2100);
  // дні пар: 59 (витрати 1000), 28 (550), 59 (550) — середнє, зважене на витрати
  near(a.days, (59 * 1000 + 28 * 550 + 59 * 550) / 2100);
});

test('позиції: вихід і новий вхід того самого дня — дві позиції; порожній вхід — порожньо', () => {
  const ps = positions(
    pairs([
      trade('2025-01-10', 'BUY', 1, 100),
      trade('2025-02-10', 'SELL', 1, 110),
      trade('2025-02-10', 'BUY', 1, 110),
      trade('2025-03-10', 'SELL', 1, 120),
    ]),
  );
  assert.equal(ps.length, 2);
  assert.deepEqual(positions([]), []);
});
