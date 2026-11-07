import { parseGeneric } from './generic.js';
import { parseIbkrActivity } from './ibkr-activity.js';
import { parseIbkrFlex } from './ibkr-flex.js';
import { applySplits } from './corporate.js';

/**
 * @typedef {object} Parsed
 * @property {import('../csv.js').Trade[]} trades
 * @property {import('./corporate.js').Cash[]} cash
 * @property {import('./corporate.js').Split[]} splits
 * @property {string[]} warnings
 */

/**
 * Визначає формат виписки й розбирає її.
 * @param {string} text
 * @returns {Parsed & { format: 'ibkr-activity' | 'ibkr-flex' | 'generic' }}
 */
export function parseFile(text) {
  text = text.replace(/^\uFEFF/, '');
  if (/^Trades,Header,/m.test(text)) return { format: 'ibkr-activity', ...parseIbkrActivity(text) };
  if (/TradePrice/i.test(text.slice(0, 5000))) return { format: 'ibkr-flex', ...parseIbkrFlex(text) };
  return { format: 'generic', cash: [], splits: [], ...parseGeneric(text) };
}

// Ключ для пошуку того самого рядка в іншому файлі
const once = (items, key) => {
  const seen = new Set();
  return items.filter((x) => !seen.has(key(x)) && seen.add(key(x)));
};

/**
 * Об'єднує кілька розібраних файлів і перераховує угоди за сплітами. Дублікати угод шукаємо лише між файлами:
 * виписки за суміжні періоди можуть перекриватись, а однакові рядки в одному файлі — це справжні окремі угоди.
 * @param {({ name: string, format: string } & Partial<Parsed> & Pick<Parsed, 'trades' | 'warnings'>)[]} parsed
 * @returns {Pick<Parsed, 'trades' | 'cash' | 'warnings'>}
 */
export function mergeFiles(parsed) {
  // Activity рахує ордер, а Flex — кожне виконання, тож дублікати між ними не знайти: перекриття забороняємо
  const span = (format) => {
    const d = parsed.filter((p) => p.format === format).flatMap((p) => p.trades.map((t) => t.date));
    return d.length ? [d.reduce((a, b) => (a < b ? a : b)), d.reduce((a, b) => (a > b ? a : b))] : null;
  };
  const a = span('ibkr-activity');
  const f = span('ibkr-flex');
  if (a && f && a[0] <= f[1] && f[0] <= a[1]) {
    throw new Error(
      `Activity Statement (${a.join(' — ')}) і Flex Query (${f.join(' — ')}) перекриваються за датами, тож угоди порахувались би двічі. Завантажте за цей період лише один формат.`,
    );
  }
  const seen = new Set();
  const trades = [];
  const warnings = [];
  let dup = 0;
  for (const p of parsed) {
    const keys = p.trades.map((t) => [t.date, t.time, t.symbol, t.type, t.qty, t.price].join('|'));
    p.trades.forEach((t, i) => {
      if (seen.has(keys[i])) dup++;
      else trades.push(t);
    });
    keys.forEach((k) => seen.add(k));
    warnings.push(...p.warnings.map((w) => `${p.name}: ${w}`));
  }
  if (dup) warnings.push(`Пропущено дублікатів угод: ${dup}. Виписки перекриваються за датами.`);
  // ponytail: однакові дивіденди в одному файлі теж злипаються; IBKR такого не видає, а перекриття виписок — часте
  const cash = once(
    parsed.flatMap((p) => p.cash ?? []),
    (c) => [c.date, c.symbol, c.currency, c.amount, c.type].join('|'),
  );
  const splits = once(
    parsed.flatMap((p) => p.splits ?? []),
    (s) => [s.symbol, s.date, s.ratio].join('|'),
  );
  return { trades: applySplits(trades, splits), cash, warnings };
}
