// Bootstrap-інтервал: статистика на багатьох випадкових перевибірках із поверненням.
// Фіксований seed робить результат однаковим між запусками — і в тестах, і на сторінці.

/** mulberry32: малий детермінований генератор у [0, 1) */
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Перцентильний інтервал. Кожна вибірка перевибирається окремо, тож різниця двох груп — це stat(a, b).
 * @template T
 * @param {T[][]} samples
 * @param {(...resampled: T[][]) => number} stat
 * @param {{ runs?: number, level?: number, seed?: number }} [opts]
 * @returns {[number, number]} [нижня, верхня]; NaN, якщо якась вибірка порожня
 */
export function bootstrap(samples, stat, { runs = 2000, level = 0.9, seed = 1 } = {}) {
  if (samples.some((s) => !s.length)) return [NaN, NaN];
  const rand = rng(seed);
  const values = [];
  for (let r = 0; r < runs; r++) {
    values.push(stat(...samples.map((s) => s.map(() => s[Math.floor(rand() * s.length)]))));
  }
  values.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return [values[Math.floor(tail * runs)], values[Math.ceil((1 - tail) * runs) - 1]];
}
