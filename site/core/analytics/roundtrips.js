/**
 * Пара «вхід–вихід»: одна частина лота, закрита одним продажем. Суми у валюті угоди, без курсів НБУ.
 * @typedef {object} RoundTrip
 * @property {string} symbol
 * @property {string} currency
 * @property {string} entry дата купівлі
 * @property {string} exit дата продажу
 * @property {number} qty
 * @property {number} cost ціна купівлі × кількість + частина комісії купівлі
 * @property {number} proceeds ціна продажу × кількість − частина комісії продажу
 * @property {number} result proceeds − cost
 * @property {number} ret result / cost; NaN, якщо купівля була за нульовою ціною
 * @property {number} days календарні дні утримання
 */

const DAY = 86_400_000;

/**
 * Розкладає продажі з fifo() на пари «вхід–вихід». Комісія продажу ділиться пропорційно кількості.
 * Частина продажу без знайденої купівлі (поле missing) пари не має і пропускається.
 * @param {import('../fifo.js').SaleRow[]} sales
 * @returns {RoundTrip[]}
 */
export function roundtrips(sales) {
  return sales.flatMap((s) =>
    s.lots.map((l) => {
      const cost = l.qty * l.price + l.fee;
      const proceeds = l.qty * (s.price - s.fee / s.qty);
      return {
        symbol: s.symbol,
        currency: s.currency,
        entry: l.date,
        exit: s.date,
        qty: l.qty,
        cost,
        proceeds,
        result: proceeds - cost,
        ret: cost > 0 ? (proceeds - cost) / cost : NaN,
        days: Math.round((Date.parse(s.date) - Date.parse(l.date)) / DAY),
      };
    }),
  );
}
