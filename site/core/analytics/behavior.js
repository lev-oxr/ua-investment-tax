// Поведінкові зрізи: як результат угоди залежить від обставин входу. Кожна оцінка — з bootstrap-інтервалом.
import { mean, median, HOLD } from './metrics.js';
import { bootstrap } from './bootstrap.js';

/**
 * @typedef {object} Slice
 * @property {string} label
 * @property {number} n розмір меншої з груп, від якої залежить оцінка
 * @property {number} value
 * @property {number} lo
 * @property {number} hi
 */

const winShare = (xs) => xs.filter((x) => x > 0).length / xs.length;
const range = ([lo, hi]) => ({ lo, hi });

/** @returns {Slice} */
const one = (label, xs, stat = mean) => ({ label, n: xs.length, value: stat(xs), ...range(bootstrap([xs], stat)) });
/** @returns {Slice} */
const diff = (label, a, b, stat = mean) => {
  const d = (x, y) => stat(y) - stat(x);
  return { label, n: Math.min(a.length, b.length), value: d(a, b), ...range(bootstrap([a, b], d)) };
};

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * @typedef {object} Behavior
 * @property {Slice} expectancy середній результат угоди
 * @property {Slice} winRate частка прибуткових
 * @property {Slice[]} afterLoss після прибутку, після збитку, різниця
 * @property {Slice[]} weekday за днем тижня входу
 * @property {Slice[]} hold за кошиком днів утримання
 * @property {Slice} disposition медіана днів утримання збиткових мінус прибуткових
 */

/**
 * @param {import('./roundtrips.js').RoundTrip[]} trips
 * @returns {Behavior}
 */
export function behavior(trips) {
  const ok = trips.filter((t) => Number.isFinite(t.ret));
  const ret = (ts) => ts.map((t) => t.ret);

  // Попередня угода — остання, закрита строго до дня входу: її результат уже був відомий при рішенні
  // ponytail: O(n²) пошук, сортування й бінарний пошук, якщо угод стане тисячі
  const after = { win: [], loss: [] };
  for (const t of ok) {
    const prev = ok.filter((p) => p.exit < t.entry).reduce((a, p) => (!a || p.exit >= a.exit ? p : a), null);
    if (prev?.ret > 0) after.win.push(t.ret);
    else if (prev?.ret < 0) after.loss.push(t.ret);
  }

  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => ok.some((t) => weekday(t.entry) === d));
  const bucket = (t) => HOLD.findIndex(([edge]) => t.days <= edge);
  const wins = ok.filter((t) => t.ret > 0).map((t) => t.days);
  const losses = ok.filter((t) => t.ret < 0).map((t) => t.days);

  return {
    expectancy: one('Очікування', ret(ok)),
    winRate: one('Частка прибуткових', ret(ok), winShare),
    afterLoss: [
      one('Після прибутку', after.win),
      one('Після збитку', after.loss),
      diff('Після збитку − після прибутку', after.win, after.loss),
    ],
    weekday: days.map((d) => one(WEEKDAYS[d], ret(ok.filter((t) => weekday(t.entry) === d)))),
    hold: HOLD.map(([, label], i) => one(label, ret(ok.filter((t) => bucket(t) === i)))).filter((s) => s.n),
    disposition: diff('Збиткові мінус прибуткові', wins, losses, median),
  };
}
