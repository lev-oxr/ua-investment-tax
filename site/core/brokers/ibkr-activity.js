import { splitCsvLine, parseNumber, parseDateTime, isValidTrade } from '../csv.js';

/**
 * Розділ Trades з IBKR Activity Statement. Колонки беремо з кожного рядка Header: у різних класів активів вони різні.
 * @param {string} text
 * @returns {{ trades: import('../csv.js').Trade[], warnings: string[] }}
 */
export function parseIbkrActivity(text) {
  const trades = [];
  const skipped = {};
  let col = null;
  let corporate = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('Corporate Actions,Data,')) corporate++;
    if (!line.startsWith('Trades,')) continue;
    const f = splitCsvLine(line);
    if (f[1] === 'Header') {
      col = Object.fromEntries(f.map((name, i) => [name, i]));
      continue;
    }
    if (f[1] !== 'Data' || !col) continue;
    const get = (name) => f[col[name]] ?? '';
    // ClosedLot і Execution — деталізація ордера, який уже є окремим рядком
    if (!['Order', 'Trade', ''].includes(get('DataDiscriminator'))) continue;
    const cat = get('Asset Category');
    if (cat !== 'Stocks') {
      skipped[cat] = (skipped[cat] ?? 0) + 1;
      continue;
    }
    const [date, time] = parseDateTime(get('Date/Time'));
    const qty = parseNumber(get('Quantity'));
    const t = {
      date,
      time,
      type: qty > 0 ? 'BUY' : 'SELL',
      symbol: get('Symbol'),
      qty: Math.abs(qty),
      price: parseNumber(get('T. Price')),
      currency: get('Currency'),
      fee: Math.abs(parseNumber(get('Comm/Fee') || '0')),
    };
    if (!isValidTrade(t)) throw new Error(`Угоду IBKR не розібрано: ${line}`);
    trades.push(t);
  }
  const warnings = Object.entries(skipped).map(
    ([cat, n]) => `Пропущено угод категорії «${cat}»: ${n}. Інструмент рахує лише Stocks.`,
  );
  if (corporate) warnings.push(`У виписці є корпоративні дії (${corporate}): спліти, злиття тощо не враховано.`);
  return { trades, warnings };
}
