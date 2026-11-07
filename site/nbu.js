const API = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';
const BATCH = 10;
const PREFIX = 'nbu:';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {{ currency: string, date: string }[]} trades
 * @param {object} [opts]
 * @param {(url: string) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>} [opts.fetch]
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [opts.storage]
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @returns {Promise<(currency: string, date: string) => number>} функція курсу для fifo()
 */
export async function getRates(trades, opts = {}) {
  const { fetch = (url) => globalThis.fetch(url), storage = defaultStorage(), onProgress = () => {} } = opts;
  const read = (key) => {
    try {
      return Number(storage?.getItem(PREFIX + key)) || undefined;
    } catch {
      return undefined;
    }
  };
  const write = (key, value) => {
    try {
      storage?.setItem(PREFIX + key, String(value));
    } catch {
      // переповнене або заблоковане сховище — кеш необов'язковий
    }
  };

  const rates = {};
  const missing = [];
  for (const key of new Set(trades.filter((t) => t.currency !== 'UAH').map((t) => `${t.currency}|${t.date}`))) {
    const cached = read(key);
    if (cached) rates[key] = cached;
    else missing.push(key);
  }

  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(
      missing.slice(i, i + BATCH).map(async (key) => {
        rates[key] = await fetchRate(fetch, ...key.split('|'));
        write(key, rates[key]);
      }),
    );
    onProgress(Math.min(i + BATCH, missing.length), missing.length);
  }

  return (currency, date) => (currency === 'UAH' ? 1 : rates[`${currency}|${date}`]);
}

async function fetchRate(fetch, currency, date) {
  const url = `${API}?valcode=${currency}&date=${date.replaceAll('-', '')}&json`;
  let res;
  let data;
  try {
    res = await fetch(url);
    data = res.ok ? await res.json() : null;
  } catch {
    throw new Error(`Не вдалося зв'язатися з bank.gov.ua, щоб отримати курс ${currency} на ${date}.`);
  }
  const rate = Array.isArray(data) ? data[0]?.rate : undefined;
  if (!(rate > 0)) {
    const why = res.ok ? 'НБУ не повернув курс' : `відповідь ${res.status}`;
    throw new Error(`Немає курсу НБУ для ${currency} на ${date}: ${why}.`);
  }
  return rate;
}
