import { splitCsvLine, parseNumber, parseDateTime } from '../csv.js';

/**
 * Денні ціни з CSV: стовпець Date і Adj Close (якщо є) або Close. Підходять вивантаження Yahoo, Stooq і Nasdaq.
 * @param {string} text
 * @returns {[string, number][]} [дата, ціна] за зростанням дати
 */
export function parsePrices(text) {
  const [head = '', ...lines] = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const cols = splitCsvLine(head).map((h) => h.toLowerCase());
  const d = cols.indexOf('date');
  const c = [/^adj\.? ?close/, /^close/].map((re) => cols.findIndex((h) => re.test(h))).find((i) => i >= 0);
  if (d < 0 || c === undefined) throw new Error('Не знайдено стовпців Date і Close: потрібен CSV з денними цінами.');
  const prices = lines
    .map((l) => splitCsvLine(l))
    .map((f) => /** @type {[string, number]} */ ([parseDateTime(f[d])[0], parseNumber(f[c]?.replace('$', ''))]))
    .filter(([date, p]) => date && p > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!prices.length) throw new Error('У файлі цін немає жодного рядка з датою й ціною.');
  return prices;
}

/**
 * @typedef {object} Benchmark
 * @property {number} n угоди, для яких є ціни на весь період
 * @property {number} skipped угоди поза періодом файлу цін або з нульовою собівартістю
 * @property {number} beat частка угод, кращих за індекс
 * @property {number} excess середня різниця дохідності угоди й індексу за той самий період
 * @property {string} from
 * @property {string} to
 */

/**
 * Кожна угода проти купівлі індексу в день входу й продажу в день виходу. Ціна дня без торгів — останнє закриття до нього.
 * @param {import('./roundtrips.js').RoundTrip[]} trips
 * @param {[string, number][]} prices з parsePrices
 * @returns {Benchmark}
 */
export function benchmark(trips, prices) {
  const from = prices[0][0];
  const to = prices.at(-1)[0];
  const at = (date) => {
    let lo = 0;
    let hi = prices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (prices[mid][0] <= date) lo = mid;
      else hi = mid - 1;
    }
    return prices[lo][1];
  };
  const excess = trips
    .filter((t) => Number.isFinite(t.ret) && t.entry >= from && t.exit <= to)
    .map((t) => t.ret - (at(t.exit) / at(t.entry) - 1));
  return {
    n: excess.length,
    skipped: trips.length - excess.length,
    beat: excess.filter((x) => x > 0).length / excess.length,
    excess: excess.reduce((a, x) => a + x, 0) / excess.length,
    from,
    to,
  };
}
