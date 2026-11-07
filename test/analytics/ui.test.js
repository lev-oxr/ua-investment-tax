import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, bench } from '../../site/ui/analytics.js';
import { metrics } from '../../site/core/analytics/metrics.js';
import { benchmark } from '../../site/core/analytics/benchmark.js';
import { behavior } from '../../site/core/analytics/behavior.js';

const view = (trips) => summary(metrics(trips), behavior(trips));

const trip = (ret, currency = 'USD') => ({
  currency,
  entry: '2025-01-02',
  exit: '2025-01-03',
  cost: 100,
  result: ret * 100,
  ret,
  days: 1,
});

test('мало угод і без збиткових: попередження, прочерки замість NaN, валюта екранована', () => {
  const html = view([trip(0.1), trip(0.2, '<b>')]);
  assert.match(html, /Угод лише 2/);
  assert.doesNotMatch(html, /NaN|Infinity|<b>\s*<\/span>/);
  assert.match(html, /&lt;b&gt;/);
});

test('без угод і без перетину з цінами — текст, а не порожні картки', () => {
  assert.match(view([]), /Немає закритих угод/);
  const b = benchmark([trip(0.1)], [['2026-01-02', 100]]);
  assert.match(bench(b), /жодна угода не потрапляє/);
});
