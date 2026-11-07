// Метрики результативності пар «вхід–вихід». Усе у відсотках від позиції, тож валюти не змішуються.

export const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Кошики днів утримання: [верхня межа включно, підпис] */
export const HOLD = [
  [1, '0–1 дн.'],
  [7, '2–7 дн.'],
  [30, '8–30 дн.'],
  [90, '31–90 дн.'],
  [365, '91–365 дн.'],
  [Infinity, '> 365 дн.'],
];
/** Кошики результату: [верхня межа не включно, підпис] */
export const RET = [
  [-0.2, '< −20%'],
  [-0.1, '−20…−10%'],
  [-0.05, '−10…−5%'],
  [0, '−5…0%'],
  [0.05, '0…5%'],
  [0.1, '5…10%'],
  [0.2, '10…20%'],
  [Infinity, '≥ 20%'],
];

// Кошик значення — перший, у межу якого воно потрапляє
const histogram = (xs, edges, inside) => {
  const at = xs.map((x) => edges.findIndex(([edge]) => inside(x, edge)));
  return edges.map(([, label], i) => ({ label, count: at.filter((j) => j === i).length }));
};

/**
 * @typedef {object} Metrics
 * @property {number} n угоди з відомою собівартістю
 * @property {number} wins
 * @property {number} losses
 * @property {number} winRate частка прибуткових
 * @property {number} avgWin середній прибуток прибуткової угоди, частка позиції
 * @property {number} avgLoss середній збиток збиткової угоди, від'ємний
 * @property {number} payoff avgWin / |avgLoss|
 * @property {number} expectancy середній результат угоди, частка позиції
 * @property {number} days медіана днів утримання
 * @property {number} winDays медіана днів утримання прибуткових
 * @property {number} lossDays медіана днів утримання збиткових
 * @property {{ label: string, count: number }[]} hold
 * @property {{ label: string, count: number }[]} returns
 * @property {Record<string, number>} total сума результатів за валютою
 */

/**
 * Порожні вибірки дають NaN: показ сам вирішує, що писати замість числа.
 * @param {import('./roundtrips.js').RoundTrip[]} trips
 * @returns {Metrics}
 */
export function metrics(trips) {
  const ok = trips.filter((t) => Number.isFinite(t.ret));
  const wins = ok.filter((t) => t.ret > 0);
  const losses = ok.filter((t) => t.ret < 0);
  const avgWin = mean(wins.map((t) => t.ret));
  const avgLoss = mean(losses.map((t) => t.ret));
  const total = {};
  for (const t of trips) total[t.currency] = (total[t.currency] ?? 0) + t.result;
  return {
    n: ok.length,
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length / ok.length,
    avgWin,
    avgLoss,
    payoff: avgWin / -avgLoss,
    expectancy: mean(ok.map((t) => t.ret)),
    days: median(ok.map((t) => t.days)),
    winDays: median(wins.map((t) => t.days)),
    lossDays: median(losses.map((t) => t.days)),
    hold: histogram(
      ok.map((t) => t.days),
      HOLD,
      (x, edge) => x <= edge,
    ),
    returns: histogram(
      ok.map((t) => t.ret),
      RET,
      (x, edge) => x < edge,
    ),
    total,
  };
}
