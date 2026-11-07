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

/**
 * Збирає пари в позиції: від першої купівлі тікера, доки всі куплені акції не продано. Докупівлі й часткові
 * продажі однієї позиції — одне рішення, тож для статистики це одне спостереження, а не кілька залежних.
 * Пари перетинаються в часі — позиція та сама; вихід одного дня з входом наступної пари — нова позиція.
 * ponytail: за датами без часу купівля й продаж того самого дня вважаються новою позицією
 * @param {RoundTrip[]} trips
 * @returns {RoundTrip[]} entry — перша купівля, exit — останній продаж, days — середнє днів пар, зважене на витрати
 */
export function positions(trips) {
  const sorted = [...trips].sort((a, b) =>
    a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0,
  );
  const groups = [];
  for (const t of sorted) {
    const g = groups.at(-1);
    if (g && g.symbol === t.symbol && t.entry < g.exit) {
      g.trips.push(t);
      if (t.exit > g.exit) g.exit = t.exit;
    } else groups.push({ symbol: t.symbol, exit: t.exit, trips: [t] });
  }
  return groups.map(({ trips: ts }) => {
    const sum = (k) => ts.reduce((a, t) => a + t[k], 0);
    const cost = sum('cost');
    const proceeds = sum('proceeds');
    return {
      symbol: ts[0].symbol,
      currency: ts[0].currency,
      entry: ts[0].entry,
      exit: ts.reduce((a, t) => (t.exit > a ? t.exit : a), ts[0].exit),
      qty: sum('qty'),
      cost,
      proceeds,
      result: proceeds - cost,
      ret: cost > 0 ? (proceeds - cost) / cost : NaN,
      days: cost > 0 ? ts.reduce((a, t) => a + t.days * t.cost, 0) / cost : sum('days') / ts.length,
    };
  });
}
