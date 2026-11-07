import { PDFO, militaryRate } from './tax.js';

/** Дивіденди від нерезидента: половина ставки п. 167.1 (пп. 170.11.1 «а», 167.5.4) */
export const DIV_RATE = PDFO / 2;

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Одна виплата: дивіденд або виплата замість дивіденду за тікером і датою, разом з податком, утриманим за кордоном.
 * @typedef {object} DividendRow
 * @property {string} date
 * @property {string} symbol
 * @property {string} currency
 * @property {'DIV' | 'LIEU'} type LIEU — виплата замість дивіденду, коли акції позичено: це не дивіденд емітента
 * @property {number} gross у валюті
 * @property {number} withheld утримано за кордоном, у валюті, ≥ 0
 * @property {number} rate курс НБУ на дату виплати (п. 164.4)
 * @property {number} income gross у гривнях
 * @property {number} withheldUah
 */

/**
 * @param {import('./brokers/corporate.js').Cash[]} cash
 * @param {(currency: string, date: string) => number} rate
 * @returns {DividendRow[]}
 */
export function dividendRows(cash, rate) {
  const rows = new Map();
  const key = (c, type) => `${c.date}|${c.symbol}|${c.currency}|${type}`;
  const row = (c, type) => {
    if (!rows.has(key(c, type))) {
      rows.set(key(c, type), { date: c.date, symbol: c.symbol, currency: c.currency, type, gross: 0, withheld: 0 });
    }
    return rows.get(key(c, type));
  };
  for (const c of cash) if (c.type !== 'WHT') row(c, c.type).gross += c.amount;
  // Податок прив'язуємо до виплати того самого дня; коригування податку окремим днем стає окремим рядком
  for (const c of cash) {
    if (c.type === 'WHT') (rows.get(key(c, 'DIV')) ?? rows.get(key(c, 'LIEU')) ?? row(c, 'DIV')).withheld -= c.amount;
  }
  return [...rows.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => {
      const r = rate(d.currency, d.date);
      if (!(r > 0)) throw new Error(`Немає курсу НБУ для ${d.currency} на ${d.date}`);
      return { ...d, rate: r, income: r2(d.gross * r), withheldUah: r2(d.withheld * r) };
    });
}

/**
 * @typedef {object} DividendTotals
 * @property {number} income рядок 10.10, графа 3
 * @property {number} pdfo графа 6: 9% з дивідендів, 18% з виплат замість дивідендів
 * @property {number} milRate
 * @property {number} military графа 7
 * @property {number} withheldUah утримано за кордоном; у зменшення податку (рядок 18) лише з документами за ст. 13
 */

/**
 * Підсумок за рік. Від'ємна сума (сторно більше за виплати) податку не дає.
 * @param {DividendRow[]} rows
 * @param {string} year
 * @returns {DividendTotals}
 */
export function dividendTotals(rows, year) {
  const ys = rows.filter((r) => r.date.startsWith(year));
  const sum = (pick) => r2(ys.filter(pick).reduce((a, r) => a + r.income, 0));
  const div = Math.max(
    sum((r) => r.type === 'DIV'),
    0,
  );
  const lieu = Math.max(
    sum((r) => r.type === 'LIEU'),
    0,
  );
  const milRate = militaryRate(year);
  return {
    income: r2(div + lieu),
    pdfo: r2(div * DIV_RATE + lieu * PDFO),
    milRate,
    military: r2((div + lieu) * milRate),
    withheldUah: r2(ys.reduce((a, r) => a + r.withheldUah, 0)),
  };
}
