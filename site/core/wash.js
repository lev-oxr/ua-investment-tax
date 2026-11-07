import { EPS } from './fifo.js';

const DAY = 864e5;
const pack = (row) => `${row.symbol}|${row.date}|${row.time}`;

/**
 * пп. 170.2.4: купівлі ідентичних паперів за 30 календарних днів до або після продажу зі збитком.
 * Лише попередження: для біржових угод правило не діє (пп. 170.2.6), тож розрахунок збиток не виключає.
 * @param {import('./fifo.js').SaleRow[]} rows результат fifo()
 * @param {import('./csv.js').Trade[]} trades той самий масив, що передавали у fifo(): lots[].id — індекси в ньому
 * @returns {(import('./fifo.js').SaleRow & { wash: { date: string, exchange: string }[] })[]}
 */
export function markWash(rows, trades) {
  // Частини одного ордера (тікер + дата + час) — один проданий пакет. Інакше ордер, виконаний частинами,
  // бачить сусідню частину як «повторну купівлю».
  const taken = {};
  for (const row of rows) {
    const t = (taken[pack(row)] ??= {});
    for (const l of row.lots) t[l.id] = (t[l.id] ?? 0) + l.qty;
  }
  return rows.map((row) => {
    if (row.result >= 0) return { ...row, wash: [] };
    const sold = taken[pack(row)];
    const saleDay = Date.parse(row.date);
    // Купівля, яку проданий пакет списав повністю, — це сам пакет, а не повторна купівля
    const wash = trades
      .filter(
        (t, i) =>
          t.type === 'BUY' &&
          t.symbol === row.symbol &&
          t.qty - (sold[i] ?? 0) > EPS &&
          Math.abs(Date.parse(t.date) - saleDay) <= 30 * DAY,
      )
      .map((t) => ({ date: t.date, exchange: t.exchange ?? '' }));
    return { ...row, wash };
  });
}
