// Спільне для обох форматів IBKR: спліти з опису корпоративної дії і тікер з опису грошового руху.

/**
 * @typedef {object} Split
 * @property {string} symbol
 * @property {string} date
 * @property {string} time порожній, якщо в виписці лише дата
 * @property {number} ratio нових акцій на одну стару: «Split 4 for 1» → 4, «Split 1 for 10» → 0,1
 */

/**
 * Дивіденд, виплата замість дивіденду (акції позичені в шорт) або утриманий податок; amount у валюті, податок від'ємний.
 * @typedef {object} Cash
 * @property {string} date
 * @property {string} symbol
 * @property {string} currency
 * @property {number} amount
 * @property {'DIV' | 'LIEU' | 'WHT'} type
 */

// IBKR пише опис як «AAPL(US0378331005) Cash Dividend …» або «NVDA(US67066G1040) Split 10 for 1 (…)»
export const cashSymbol = (description) => description.match(/^([^\s(]+)\s*\(/)?.[1] ?? '';

/**
 * @param {string} description
 * @param {string} date
 * @param {string} time
 * @param {string} [symbol]
 * @returns {Split | null}
 */
export function parseSplit(description, date, time, symbol = cashSymbol(description)) {
  const m = description.match(/\bsplit\s+(\d+(?:\.\d+)?)\s+for\s+(\d+(?:\.\d+)?)/i);
  if (!m || !symbol) return null;
  return { symbol, date, time, ratio: Number(m[1]) / Number(m[2]) };
}

/**
 * Перераховує угоди до спліту в нові акції: кількість × ratio, ціна ÷ ratio. Собівартість і комісія не змінюються,
 * тож FIFO списує нові акції з тими самими витратами.
 * ponytail: дробовий залишок після зворотного спліту (IBKR виплачує його грошима) лишається в лоті
 * @param {import('../csv.js').Trade[]} trades
 * @param {Split[]} splits
 * @returns {import('../csv.js').Trade[]}
 */
export function applySplits(trades, splits) {
  // Угода в день спліту без часу вважається до нього: IBKR проводить спліт увечері перед першим днем торгів
  const before = (t, s) => `${t.date} ${t.time ?? ''}` < `${s.date} ${s.time || '99'}`;
  return trades.map((t) => {
    const ratio = splits.filter((s) => s.symbol === t.symbol && before(t, s)).reduce((a, s) => a * s.ratio, 1);
    return ratio === 1 ? t : { ...t, qty: t.qty * ratio, price: t.price / ratio };
  });
}
