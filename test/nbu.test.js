import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRates } from '../site/nbu.js';

// Фейковий НБУ: курс = 40 + день місяця, лічить запити й одночасні з'єднання
function fakeNbu(respond = (cc, date) => [{ cc, rate: 40 + Number(date.slice(6)) }]) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const fetch = async (url) => {
    const { searchParams } = new URL(url);
    calls.push(url);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 1));
    active--;
    const body = respond(searchParams.get('valcode'), searchParams.get('date'));
    if (typeof body === 'number') return { ok: false, status: body, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, calls, max: () => maxActive };
}

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), size: () => m.size };
};

test('запит за датою угоди; UAH і дублікати не запитуються', async () => {
  const nbu = fakeNbu();
  const trades = [
    { currency: 'USD', date: '2025-01-02' },
    { currency: 'USD', date: '2025-01-02' },
    { currency: 'UAH', date: '2025-01-03' },
  ];
  const rate = await getRates(trades, { fetch: nbu.fetch, storage: null });
  assert.deepEqual(nbu.calls, [
    'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&date=20250102&json',
  ]);
  assert.equal(rate('USD', '2025-01-02'), 42);
  assert.equal(rate('UAH', '2025-01-03'), 1);
  assert.equal(rate('USD', '2025-01-09'), undefined); // fifo() сам скаже, що курсу немає
});

test('кеш: повторний розрахунок не ходить у мережу', async () => {
  const nbu = fakeNbu();
  const storage = memoryStorage();
  const trades = [
    { currency: 'USD', date: '2025-01-02' },
    { currency: 'EUR', date: '2025-01-02' },
  ];
  await getRates(trades, { fetch: nbu.fetch, storage });
  assert.equal(nbu.calls.length, 2);
  const rate = await getRates(trades, { fetch: nbu.fetch, storage });
  assert.equal(nbu.calls.length, 2);
  assert.equal(rate('EUR', '2025-01-02'), 42);
});

test('без доступу до сховища (приватний режим) все одно рахує', async () => {
  const nbu = fakeNbu();
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const rate = await getRates([{ currency: 'USD', date: '2025-01-05' }], { fetch: nbu.fetch, storage: broken });
  assert.equal(rate('USD', '2025-01-05'), 45);
});

test('пачки по 10 паралельних запитів і прогрес', async () => {
  const nbu = fakeNbu();
  const trades = Array.from({ length: 25 }, (_, i) => ({
    currency: 'USD',
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
  }));
  const progress = [];
  await getRates(trades, { fetch: nbu.fetch, storage: null, onProgress: (i, n) => progress.push([i, n]) });
  assert.equal(nbu.calls.length, 25);
  assert.equal(nbu.max(), 10);
  assert.deepEqual(progress, [
    [10, 25],
    [20, 25],
    [25, 25],
  ]);
});

test('порожня відповідь — помилка з валютою й датою', async () => {
  const nbu = fakeNbu(() => []);
  await assert.rejects(
    getRates([{ currency: 'XYZ', date: '2025-01-02' }], { fetch: nbu.fetch, storage: null }),
    /Немає курсу НБУ для XYZ на 2025-01-02: НБУ не повернув курс/,
  );
});

test('відповідь не 200 — помилка зі статусом', async () => {
  const nbu = fakeNbu(() => 503);
  await assert.rejects(
    getRates([{ currency: 'USD', date: '2025-01-02' }], { fetch: nbu.fetch, storage: null }),
    /USD на 2025-01-02: відповідь 503/,
  );
});

test('мережа недоступна — зрозуміла помилка, а не TypeError', async () => {
  const fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    getRates([{ currency: 'USD', date: '2025-01-02' }], { fetch, storage: null }),
    /bank\.gov\.ua.*USD на 2025-01-02/,
  );
});
