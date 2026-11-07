import { splitCsvLine, parseNumber, parseDateTime, isValidTrade } from '../csv.js';
import { parseSplit, cashSymbol } from './corporate.js';

/**
 * IBKR Activity Statement: розділи Trades, Dividends, Withholding Tax і Corporate Actions.
 * Колонки беремо з кожного рядка Header: у різних розділах і класах активів вони різні.
 * @param {string} text
 * @returns {import('./index.js').Parsed}
 */
export function parseIbkrActivity(text) {
  const trades = [];
  const cash = [];
  const splits = [];
  const skipped = {};
  const cols = {};
  let corporate = 0;
  for (const line of text.split(/\r?\n/)) {
    const f = splitCsvLine(line);
    const section = f[0];
    if (f[1] === 'Header') {
      cols[section] = Object.fromEntries(f.map((name, i) => [name, i]));
      continue;
    }
    const col = cols[section];
    if (f[1] !== 'Data' || !col) continue;
    const get = (name) => f[col[name]] ?? '';

    if (section === 'Dividends' || section === 'Withholding Tax') {
      // Рядки Total мають у полі Currency «Total…» і порожню дату
      const [date] = parseDateTime(get('Date'));
      if (!date || !/^[A-Z]{3}$/.test(get('Currency'))) continue;
      const description = get('Description');
      cash.push({
        date,
        symbol: cashSymbol(description),
        currency: get('Currency'),
        amount: parseNumber(get('Amount')),
        type: section === 'Withholding Tax' ? 'WHT' : /in lieu/i.test(description) ? 'LIEU' : 'DIV',
      });
      continue;
    }

    if (section === 'Corporate Actions') {
      if (get('Asset Category') && get('Asset Category') !== 'Stocks') continue;
      const [date, time] = parseDateTime(get('Date/Time'));
      const split = date && parseSplit(get('Description'), date, time);
      if (split) splits.push(split);
      else if (date) corporate++;
      continue;
    }

    if (section !== 'Trades') continue;
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
  if (corporate) {
    warnings.push(`У виписці є корпоративні дії, крім сплітів (${corporate}): злиття, виділення тощо не враховано.`);
  }
  return { trades, cash, splits, warnings };
}
