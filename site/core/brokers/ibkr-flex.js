import { splitCsvLine, parseNumber, parseDateTime, isValidTrade } from '../csv.js';
import { parseSplit, cashSymbol } from './corporate.js';

// Назви колонок Flex залежать від налаштувань запиту, тому порівнюємо без регістру й символів
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Службові рядки опції «Include header and trailer records»
const MARKERS = /^(BOF|BOA|BOS|EOS|EOA|EOF)$/;
// Type у розділі Cash Transactions
const CASH = { dividends: 'DIV', paymentinlieuofdividends: 'LIEU', withholdingtax: 'WHT' };

/**
 * IBKR Flex Query у CSV: Trades, а також Cash Transactions (дивіденди, податок) і Corporate Actions, якщо вони є
 * в тому самому запиті. На рівні EXECUTION кожне виконання має своє поле Exchange.
 * @param {string} text
 * @returns {import('./index.js').Parsed}
 */
export function parseIbkrFlex(text) {
  const rows = [];
  const other = [];
  let col = null;
  let tradeCol = null;
  for (const line of text.split(/\r?\n/)) {
    let f = splitCsvLine(line);
    const code = f[0];
    if (code === 'HEADER' || code === 'DATA') f = f.slice(2); // опція «section code and line descriptor»
    if (f.length <= 2 || MARKERS.test(f[0])) continue;
    const n = f.map(norm);
    // Рядок назв: явний HEADER або рядок із полем Symbol без жодної цифри (у даних завжди є дата)
    const isTrades = n.includes('tradeprice') && n.includes('quantity');
    if (code === 'HEADER' || isTrades || (n.includes('symbol') && !/\d/.test(f.join('')))) {
      col = Object.fromEntries(n.map((x, i) => [x, i]));
      if (isTrades) tradeCol = col;
      continue;
    }
    if (!col) continue;
    const c = col; // фіксуємо заголовок цього розділу: наступний може мати інші колонки
    (c === tradeCol ? rows : other).push((name) => f[c[name]] ?? '');
  }
  if (!tradeCol) throw new Error('У Flex Query не знайдено колонок TradePrice і Quantity.');

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

  const cash = [];
  const splits = [];
  for (const g of other) {
    const [date, time] = parseDateTime(g('datetime') || g('reportdate') || g('date') || g('settledate'));
    if (!date) continue;
    const description = g('description');
    const symbol = g('symbol') || cashSymbol(description);
    const type = CASH[norm(g('type'))];
    const currency = g('currencyprimary') || g('currency');
    if (type && /^[A-Z]{3}$/.test(currency)) {
      cash.push({ date, symbol, currency, amount: parseNumber(g('amount')), type });
      continue;
    }
    const split = parseSplit(description, date, time, symbol);
    if (split) splits.push(split);
  }

  const warnings = Object.entries(skipped).map(
    ([cat, n]) => `Пропущено угод класу «${cat}»: ${n}. Інструмент рахує лише STK.`,
  );
  if (!('exchange' in tradeCol)) {
    warnings.push('У Flex Query немає поля Exchange — увімкніть його, щоб бачити місце виконання угод.');
  }
  return { trades, cash, splits, warnings };
}
