import { splitCsvLine, parseNumber, parseDateTime, isValidTrade } from '../csv.js';

// Назви колонок Flex залежать від налаштувань запиту, тому порівнюємо без регістру й символів
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Службові рядки опції «Include header and trailer records»
const MARKERS = /^(BOF|BOA|BOS|EOS|EOA|EOF)$/;

/**
 * Розділ Trades з IBKR Flex Query у CSV. На рівні EXECUTION кожне виконання має своє поле Exchange.
 * @param {string} text
 * @returns {{ trades: import('../csv.js').Trade[], warnings: string[] }}
 */
export function parseIbkrFlex(text) {
  const rows = [];
  let col = null;
  for (const line of text.split(/\r?\n/)) {
    let f = splitCsvLine(line);
    if (f[0] === 'HEADER' || f[0] === 'DATA') f = f.slice(2); // опція «section code and line descriptor»
    const n = f.map(norm);
    if (n.includes('tradeprice') && n.includes('quantity')) {
      col = Object.fromEntries(n.map((x, i) => [x, i]));
      continue;
    }
    if (col && f.length > 2 && !MARKERS.test(f[0])) {
      const c = col; // фіксуємо заголовок цього розділу: наступний може мати інші колонки
      rows.push((name) => f[c[name]] ?? '');
    }
  }
  if (!col) throw new Error('У Flex Query не знайдено колонок TradePrice і Quantity.');

  // Якщо в запиті кілька рівнів деталізації, беремо найдрібніший, щоб не рахувати угоду двічі
  const levels = new Set(rows.map((g) => g('levelofdetail').toUpperCase()));
  const level = levels.has('EXECUTION') ? 'EXECUTION' : levels.has('ORDER') ? 'ORDER' : '';
  const trades = [];
  const skipped = {};
  for (const g of rows) {
    if (g('levelofdetail').toUpperCase() !== level) continue;
    const cat = g('assetclass');
    if (cat && cat !== 'STK') {
      skipped[cat] = (skipped[cat] ?? 0) + 1;
      continue;
    }
    const raw = g('datetime') || g('tradedate');
    const [date, time] = parseDateTime(raw);
    const qty = parseNumber(g('quantity'));
    const t = {
      date,
      time,
      type: qty > 0 ? 'BUY' : 'SELL',
      symbol: g('symbol'),
      qty: Math.abs(qty),
      price: parseNumber(g('tradeprice')),
      currency: g('currencyprimary') || g('currency'),
      fee: Math.abs(parseNumber(g('ibcommission') || '0')),
      exchange: g('exchange'),
    };
    if (!isValidTrade(t)) throw new Error(`Угоду з Flex Query не розібрано: ${t.symbol || '?'} ${raw}`);
    trades.push(t);
  }
  const warnings = Object.entries(skipped).map(
    ([cat, n]) => `Пропущено угод класу «${cat}»: ${n}. Інструмент рахує лише STK.`,
  );
  if (!('exchange' in col)) {
    warnings.push('У Flex Query немає поля Exchange — увімкніть його, щоб бачити місце виконання угод.');
  }
  return { trades, warnings };
}
