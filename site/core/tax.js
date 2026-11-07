export const PDFO = 0.18;

// Гривневі суми округлюються до копійок, як і у fifo.js
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Ставка військового збору. 5% діє з 01.12.2024 (Закон № 4015-IX), раніше — 1,5%.
 * ponytail: 2024 рік рахується за 5% цілком; UI просить звірити, бо до грудня ставка була 1,5%
 * @param {number | string} year
 * @returns {number}
 */
export const militaryRate = (year) => (Number(year) < 2024 ? 0.015 : 0.05);

/**
 * @typedef {object} Totals
 * @property {number} income
 * @property {number} expense
 * @property {number} result фінансовий результат року до перенесення збитку
 * @property {number} lossIn непогашений збиток минулих років (≥ 0)
 * @property {number} base база оподаткування, ніколи не від'ємна
 * @property {number} lossOut збиток, що переходить на наступний рік (≥ 0)
 * @property {number} pdfo
 * @property {number} milRate
 * @property {number} military
 */

/**
 * Підсумок за рік. Збиток минулих років зменшує результат, доки не погаситься (пп. 170.2.6).
 * @param {{ income: number, expense: number, result: number, missing?: number }[]} rows продажі одного року;
 *   продажі з missing (бракує купівель) у підсумки не йдуть
 * @param {number} [lossIn]
 * @param {number | string} [year]
 * @returns {Totals}
 */
export function totals(rows, lossIn = 0, year) {
  const counted = rows.filter((r) => !r.missing);
  const sum = (k) => r2(counted.reduce((a, r) => a + r[k], 0));
  const result = sum('result');
  const net = r2(result - lossIn);
  const base = Math.max(net, 0);
  const milRate = militaryRate(year);
  return {
    income: sum('income'),
    expense: sum('expense'),
    result,
    lossIn,
    base,
    lossOut: Math.max(-net, 0),
    pdfo: r2(base * PDFO),
    milRate,
    military: r2(base * milRate),
  };
}

/**
 * Підсумки по роках продажів, збиток переноситься на наступні роки.
 * @param {{ date: string, income: number, expense: number, result: number }[]} rows
 * @param {{ carryLoss?: boolean }} [opts] carryLoss: false — кожен рік без збитків минулих років,
 *   наприклад якщо ті роки не декларувались і переносити їхній збиток ризиковано
 * @returns {Record<string, Totals>}
 */
export function yearly(rows, { carryLoss = true } = {}) {
  const years = [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort();
  let loss = 0;
  return Object.fromEntries(
    years.map((y) => {
      const t = totals(
        rows.filter((r) => r.date.startsWith(y)),
        carryLoss ? loss : 0,
        y,
      );
      loss = t.lossOut;
      return [y, t];
    }),
  );
}
