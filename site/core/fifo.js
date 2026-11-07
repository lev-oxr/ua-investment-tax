// Залишок лота, менший за EPS, вважається нулем: дробові акції дають похибку float.
// ponytail: float + EPS; перейти на цілі (мікроакції), якщо кількості розійдуться з брокером
export const EPS = 1e-9;

// Гривневі суми округлюються до копійок на кожному кроці, щоб показана арифметика сходилась
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Частина лота, списана на продаж.
 * @typedef {object} LotPart
 * @property {number} id індекс купівлі у вхідному масиві trades
 * @property {string} date
 * @property {number} qty
 * @property {number} price
 * @property {string} currency
 * @property {number} fee частина комісії купівлі у валюті, пропорційно кількості
 * @property {number} rate курс НБУ на дату купівлі
 * @property {number} cost собівартість частини в гривнях
 */

/**
 * Результат одного продажу в гривнях.
 * @typedef {object} SaleRow
 * @property {string} date
 * @property {string} time
 * @property {string} symbol
 * @property {string} exchange
 * @property {number} qty
 * @property {number} price
 * @property {number} fee комісія продажу у валюті
 * @property {number} feeUah
 * @property {string} currency
 * @property {number} rate курс НБУ на дату продажу
 * @property {number} income
 * @property {number} expense
 * @property {number} result
 * @property {LotPart[]} lots
 * @property {number} [missing] скільки штук продано без знайденої купівлі; такий продаж не рахується в підсумках
 */

/**
 * Собівартість за FIFO. Купівля — за курсом дати купівлі, продаж — за курсом дати продажу.
 * @param {import('./csv.js').Trade[]} trades
 * @param {(currency: string, date: string) => number} rate гривень за 1 одиницю валюти
 * @param {{ allowMissing?: boolean }} [opts] allowMissing: не зупинятись, якщо купівель бракує, а позначити
 *   такий продаж полем missing. Знайдені лоти він однаково списує, щоб наступні продажі взяли правильні лоти.
 * @returns {SaleRow[]}
 */
export function fifo(trades, rate, { allowMissing = false } = {}) {
  const key = (t) => `${t.date} ${t.time ?? ''}`;
  // За однакових дати й часу зберігаємо порядок у файлі
  const sorted = trades
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.i - b.i));
  const lots = {};
  const rows = [];
  for (const t of sorted) {
    const r = rate(t.currency, t.date);
    if (!(r > 0)) throw new Error(`Немає курсу НБУ для ${t.currency} на ${t.date}`);
    const queue = (lots[t.symbol] ??= []);
    if (t.type === 'BUY') {
      queue.push({
        id: t.i,
        date: t.date,
        qty: t.qty,
        price: t.price,
        currency: t.currency,
        feePerUnit: t.fee / t.qty,
        rate: r,
        unitCost: ((t.qty * t.price + t.fee) * r) / t.qty,
      });
      continue;
    }
    let left = t.qty;
    let cost = 0;
    const used = [];
    while (left > EPS) {
      const lot = queue[0];
      if (!lot) {
        if (allowMissing) break;
        throw new Error(
          `${t.date} ${t.symbol}: продано ${t.qty}, а куплено менше. Бракує виписки за ранній рік, перенесення позиції чи спліта?`,
        );
      }
      const take = Math.min(left, lot.qty);
      const lotCost = r2(take * lot.unitCost);
      // Комісія купівлі розподіляється пропорційно до проданої кількості
      used.push({
        id: lot.id,
        date: lot.date,
        qty: take,
        price: lot.price,
        currency: lot.currency,
        fee: take * lot.feePerUnit,
        rate: lot.rate,
        cost: lotCost,
      });
      cost += lotCost;
      left -= take;
      lot.qty -= take;
      if (lot.qty <= EPS) queue.shift();
    }
    // Без частини купівель собівартість невідома: продаж показуємо, але в підсумки він не йде
    const missing = left > EPS ? Math.round(left * 1e8) / 1e8 : 0;
    const income = r2(t.qty * t.price * r);
    const feeUah = r2(t.fee * r);
    const expense = r2(cost + feeUah);
    rows.push({
      date: t.date,
      time: t.time ?? '',
      symbol: t.symbol,
      exchange: t.exchange ?? '',
      qty: t.qty,
      price: t.price,
      fee: t.fee,
      feeUah,
      currency: t.currency,
      rate: r,
      income,
      expense,
      result: missing ? 0 : r2(income - expense),
      lots: used,
      ...(missing && { missing }),
    });
  }
  return rows;
}
