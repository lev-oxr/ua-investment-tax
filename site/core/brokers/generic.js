import { splitCsvLine, parseNumber, parseDateTime, isValidTrade } from '../csv.js';

const REQUIRED = ['date', 'type', 'symbol', 'qty', 'price', 'currency'];

/**
 * Власний формат: date,type,symbol,qty,price,currency[,fee]; type = BUY | SELL.
 * @param {string} text
 * @returns {{ trades: import('../csv.js').Trade[], warnings: string[] }}
 */
export function parseGeneric(text) {
  const lines = text.split(/\r?\n/);
  const cols = splitCsvLine(lines[0]).map((s) => s.toLowerCase());
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length) {
    throw new Error(`Файл не схожий ні на виписку IBKR, ні на власний формат: немає колонок ${missing.join(', ')}`);
  }
  const trades = [];
  lines.forEach((line, i) => {
    if (i === 0 || !line.trim()) return;
    const v = Object.fromEntries(splitCsvLine(line).map((s, j) => [cols[j], s]));
    const [date, time] = parseDateTime(v.date);
    const t = {
      date,
      time,
      type: (v.type ?? '').toUpperCase(),
      symbol: v.symbol ?? '',
      qty: parseNumber(v.qty),
      price: parseNumber(v.price),
      currency: (v.currency ?? '').toUpperCase(),
      fee: parseNumber(v.fee || '0'),
    };
    // Номер рядка рахуємо до відкидання порожніх, щоб він збігався з тим, що бачить користувач
    if (!isValidTrade(t)) throw new Error(`Рядок ${i + 1} не розібрано: ${line}`);
    trades.push(t);
  });
  return { trades, warnings: [] };
}
