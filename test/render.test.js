import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, uah, rate4, qty, notice, files, result, detail, declaration, csv } from '../site/ui/render.js';
import { totals } from '../site/core/tax.js';

const NB = '\u00a0'; // uk-UA розділяє тисячі нерозривним пробілом

const row = (over = {}) => ({
  date: '2025-03-10',
  time: '',
  symbol: 'AAPL',
  exchange: 'NASDAQ',
  qty: 2,
  price: 120,
  fee: 1,
  feeUah: 42,
  currency: 'USD',
  rate: 42,
  income: 10080,
  expense: 8442,
  result: 1638,
  lots: [{ id: 0, date: '2025-01-10', qty: 2, price: 100, currency: 'USD', fee: 1, rate: 40, cost: 8400 }],
  wash: [],
  ...over,
});

test('формат uk-UA: гроші, курс, кількість', () => {
  assert.equal(uah(1234.5), `1${NB}234,50 ₴`);
  assert.equal(rate4(41.1), '41,1000');
  assert.equal(qty(0.12345678), '0,12345678');
  assert.equal(qty(1000), `1${NB}000`);
});

test('усе з файлу екранується', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(esc(`"${evil}'`), '&quot;&lt;img src=x onerror=alert(1)&gt;&#39;');
  const r = row({ symbol: evil, exchange: evil, currency: evil, wash: [{ date: '2025-03-20', exchange: evil }] });
  r.result = -10;
  const t = totals([r], 0, 2025);
  for (const html of [
    result('2025', [r], t),
    detail('2025', [r], t),
    files([{ name: evil, trades: [] }]),
    notice([evil]),
  ]) {
    assert.ok(!html.includes('<img'), html);
  }
});

test('позначка «30 днів» і примітка лише для продажів з повторною купівлею', () => {
  const plain = row();
  const washed = row({ result: -100, exchange: 'DARK', wash: [{ date: '2025-03-20', exchange: 'NYSE' }] });
  const html = result('2025', [plain, washed], totals([plain, washed], 0, 2025));
  assert.equal(html.match(/class="tag"/g).length, 1);
  assert.match(html, /30 днів · не біржа\?/);
  assert.match(html, /не в списку бірж: <b>1<\/b>/);
  assert.doesNotMatch(result('2025', [plain], totals([plain], 0, 2025)), /Правило 30 днів/);
});

test('примітка про ставку збору — лише для 2024 року', () => {
  const r = [row()];
  assert.match(result('2024', r, totals(r, 0, 2024)), /01\.12\.2024/);
  assert.doesNotMatch(result('2025', r, totals(r, 0, 2025)), /01\.12\.2024/);
});

test('детально: перенесений збиток і посилання на ПКУ', () => {
  const r = [row()];
  const html = detail('2025', r, totals(r, 500, 2025));
  assert.match(html, /Мінус непогашений збиток минулих років/);
  assert.match(html, /href="https:\/\/zakon\.rada\.gov\.ua\/laws\/show\/2755-17#n11196"/);
  assert.match(html, /8\u00a0400,00/); // витрати лота
});

test('картка продажу: ціна продажу й купівлі, дати дд.мм.рррр, результат у валюті', () => {
  const r = [row()];
  const html = detail('2025', r, totals(r, 0, 2025));
  assert.match(html, /Прибуток 1\u00a0638,00 ₴/);
  assert.match(html, /2 шт\. × 120,00 USD <span class="dim">\(ціна продажу\)<\/span> = 240,00 USD/);
  assert.match(html, /\(курс НБУ на 10\.03\.2025\)/);
  assert.match(html, /Купівля 10\.01\.2025<\/td><td>2<\/td><td>100,00 USD<\/td>/);
  // 240 − (2 × 100 + 1 комісія купівлі) − 1 комісія продажу = 38 USD
  assert.match(html, /у валюті: 240,00 USD − 202,00 USD = 38,00 USD/);
  assert.match(detail('2025', [row({ result: -5 })], totals(r, 0, 2025)), /Збиток 5,00 ₴/);
  assert.match(result('2025', r, totals(r, 0, 2025)), /<td class="l">10\.03\.2025<\/td>/);
});

test('продаж без купівель: примітка, позначка, окрема картка, не в CSV', () => {
  const ok = row();
  const gap = row({ symbol: 'QQQ', qty: 2, missing: 0.3, result: 0 });
  const t = totals([ok, gap], 0, 2025);
  const html = result('2025', [ok, gap], t);
  assert.match(html, /Підсумок неповний/);
  assert.match(html, /QQQ 10\.03\.2025: продано 2 шт\., купівель знайдено на\s+1,7 шт\., бракує <b>0,3 шт\.<\/b>/);
  assert.match(html, /class="tag bad">бракує 0,3 шт\./);
  assert.match(html, /не пораховано<\/td>/);
  assert.match(html, /Неповно: не пораховано продажів — 1/);
  const card = detail('2025', [ok, gap], t);
  assert.match(card, /Бракує купівель на 0,3 шт\./);
  assert.match(card, /Купівлю не знайдено<\/td><td>0,3<\/td>/);
  assert.equal(csv([ok, gap]).trim().split('\n').length, 2); // заголовок і один пораховний продаж
  assert.doesNotMatch(result('2025', [ok], totals([ok], 0, 2025)), /Підсумок неповний/);
});

test('декларація: продажі згруповано за тікером, без непорахованих, підсумки й рядок 10.8', () => {
  const rows = [
    row({ income: 1000, expense: 800, result: 200 }),
    row({ symbol: 'MSFT', income: 500, expense: 600, result: -100 }),
    row({ income: 300, expense: 250, result: 50 }),
    row({ symbol: 'QQQ', missing: 0.3, result: 0 }),
  ];
  const html = declaration('2025', rows, totals(rows, 0, 2025));
  // AAPL: 1000 + 300 = 1300 доходу, 800 + 250 = 1050 витрат, результат 250
  assert.match(
    html,
    /<b>AAPL<\/b> <span class="dim">· продажів: 2<\/span><\/td>\s*<td>1\u00a0300,00<\/td><td>1\u00a0050,00<\/td><td class="pos">250,00<\/td>/,
  );
  assert.match(html, /<b>MSFT<\/b>/);
  assert.doesNotMatch(html, /<b>QQQ<\/b>/);
  assert.match(html, /Підсумок неповний/);
  // база 150: рядок 3.1 = 150, 4 і 4.2 = 27 (18%), 5 і 5.2 = 7,50 (5%), утримань агентом немає
  const cell = (no) =>
    html.match(
      new RegExp(`<td class="l no">${no.replace('.', '\\.')}</td><td class="l">[^<]*</td><td>([^<]*)</td>`),
    )[1];
  assert.deepEqual(['2', '3.1', '3.2', '4', '4.1', '4.2', '5', '5.1', '5.2'].map(cell), [
    '0,00',
    '150,00',
    '0,00',
    '27,00',
    '0,00',
    '27,00',
    '7,50',
    '0,00',
    '7,50',
  ]);
  // рядок 10.8 декларації: гр. 3 = 3.1, гр. 4–5 = 4.1 і 5.1, гр. 6–7 = 4.2 і 5.2
  assert.match(
    html,
    /<tbody><tr><td>150,00<\/td><td>0,00<\/td><td>0,00<\/td><td>27,00<\/td><td>7,50<\/td><\/tr><\/tbody>/,
  );
  // збитковий рік з перенесеним збитком: рядок 2, від'ємний рядок 3 і збиток у 3.2
  const loss = declaration('2025', [rows[1]], totals([rows[1]], 50, 2025));
  assert.match(loss, /Прибутку немає, тож податок 0/);
  assert.match(loss, /<td class="l no">3\.2<\/td><td class="l">[^<]*<\/td><td>150,00<\/td>/);
});

test('CSV: числа з крапкою, поля з комою в лапках', () => {
  const r = row({ symbol: 'BRK,B', wash: [{ date: '2025-03-20', exchange: 'NYSE' }] });
  assert.equal(
    csv([r]),
    'date,symbol,qty,currency,nbu_rate,income_uah,expense_uah,result_uah,buy_dates,buys_within_30_days\n' +
      '2025-03-10,"BRK,B",2,USD,42,10080.00,8442.00,1638.00,2025-01-10,2025-03-20@NYSE\n',
  );
});
