/**
 * @typedef {object} Trade
 * @property {string} date
 * @property {string} time
 * @property {'BUY'|'SELL'} type
 * @property {string} symbol
 * @property {number} qty
 * @property {number} price
 * @property {string} currency
 * @property {number} fee
 * @property {string} [exchange]
 */

/**
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * @param {string | undefined} s
 * @returns {number}
 */
export function parseNumber(s) {
  const t = String(s ?? '').trim();
  return t ? Number(t.replaceAll(',', '')) : NaN;
}

const ISO = /^(\d{4})-?(\d{2})-?(\d{2})(?:[;, T]+(\d{2}):?(\d{2}):?(\d{2}))?/;
const US = /^(\d{2})\/(\d{2})\/(\d{4})(?:[;, ]+(\d{2}):?(\d{2}):?(\d{2}))?/;

/**
 * @param {string} s
 * @returns {[string, string]} [date, time] або ['', ''], якщо дату не розпізнано
 */
export function parseDateTime(s) {
  const t = String(s ?? '').trim();
  let m = t.match(ISO);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = t.match(US))) [, mo, d, y] = m;
  else return ['', ''];
  const date = `${y}-${mo}-${d}`;
  // Відсікає 2025-02-30 і 2025-13-01: Date перекочує 30 лютого на 2 березня, тож звіряємо назад
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) return ['', ''];
  return [date, m[4] ? `${m[4]}:${m[5]}:${m[6]}` : ''];
}

/**
 * @param {Record<string, any>} t
 * @returns {boolean}
 */
export function isValidTrade(t) {
  return (
    Boolean(t.date) &&
    (t.type === 'BUY' || t.type === 'SELL') &&
    Boolean(t.symbol) &&
    t.qty > 0 &&
    t.price >= 0 &&
    t.fee >= 0 &&
    /^[A-Z]{3}$/.test(t.currency)
  );
}
