// Вкладка «Аналітика»: дані → HTML-рядок, як і render.js.
import { esc, stat, sign, day } from './render.js';

const MIN_TRADES = 30;
const ok = Number.isFinite;
const pct = (r, plus = false) =>
  ok(r)
    ? `${plus && r > 0 ? '+' : ''}${(r * 100).toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';
const num = (n, digits = 1) => (ok(n) ? n.toLocaleString('uk-UA', { maximumFractionDigits: digits }) : '—');
const money = (n, c) =>
  `<span class="${sign(n)}">${n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(c)}</span>`;

/**
 * Горизонтальні стовпці: підпис і число — звичайний текст, тож на телефоні вони не дрібнішають, а SVG лише малює смугу.
 * @param {{ label: string, count: number }[]} bins
 * @param {(i: number) => string} [cls] клас смуги
 */
const bars = (bins, cls = () => '') => {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const all = bins.reduce((a, b) => a + b.count, 0) || 1;
  return `<div class="bars">${bins
    .map(
      (b, i) => `<div class="bar" title="${b.label}: ${b.count} (${pct(b.count / all)})">
        <span>${b.label}</span>
        <svg aria-hidden="true" height="14"><rect class="${cls(i)}" width="${(b.count / max) * 100}%" height="14" rx="3"/></svg>
        <b>${b.count}</b>
      </div>`,
    )
    .join('')}</div>`;
};

const ci = (s, f) => (ok(s.lo) ? `90%: ${f(s.lo, true)} … ${f(s.hi, true)}` : '');
const days = (n, plus = false) => (ok(n) ? `${plus && n > 0 ? '+' : ''}${num(n)} дн.` : '—');

/**
 * Інтервали на спільній осі з нулем: крапка — оцінка, відрізок — 90% bootstrap-інтервал.
 * Зріз, де менша група коротша за MIN_TRADES, блідий і без чисел.
 * @param {import('../core/analytics/behavior.js').Slice[]} slices
 */
const intervals = (slices) => {
  const shown = slices.filter((s) => s.n);
  if (!shown.length) return '<p class="meta">Немає угод для цього зрізу.</p>';
  const vals = shown.flatMap((s) => [s.lo, s.hi, s.value]).filter(ok);
  const min = Math.min(0, ...vals);
  const span = Math.max(0, ...vals) - min || 1;
  const x = (v) => `${(((v - min) / span) * 100).toFixed(2)}%`;
  return `<div class="bars">${shown
    .map((s) => {
      const few = s.n < MIN_TRADES;
      return `<div class="bar${few ? ' few' : ''}" title="${s.label}: ${pct(s.value, true)}, ${ci(s, pct)}, угод ${s.n}">
        <span>${s.label} <i>${s.n}</i></span>
        <svg aria-hidden="true" height="16">
          <line class="zero" x1="${x(0)}" x2="${x(0)}" y1="0" y2="16"/>
          <line class="ci" x1="${x(s.lo)}" x2="${x(s.hi)}" y1="8" y2="8"/>
          <circle class="${sign(s.value)}" cx="${x(s.value)}" cy="8" r="4"/>
        </svg>
        <b>${few ? 'мало даних' : pct(s.value, true)}</b>
      </div>`;
    })
    .join('')}</div>`;
};

/** @param {import('../core/analytics/behavior.js').Slice} d */
const disposition = (d) => {
  if (!ok(d.value)) return '<p class="meta">Потрібні і прибуткові, і збиткові угоди.</p>';
  const verdict =
    d.n < MIN_TRADES
      ? `Мало даних: у меншій групі ${d.n} угод.`
      : d.lo > 0
        ? 'Збиткові угоди ти тримаєш довше за прибуткові — це ефект диспозиції.'
        : d.hi < 0
          ? 'Прибуткові угоди ти тримаєш довше за збиткові.'
          : 'Різниця не відрізняється від нуля на цих даних.';
  return `<p><b>${days(d.value, true)}</b> <span class="dim">${ci(d, days)}</span></p>
    <p class="meta">Медіана днів утримання збиткових мінус прибуткових. ${verdict}</p>`;
};

/**
 * @param {import('../core/analytics/metrics.js').Metrics} m
 * @param {import('../core/analytics/behavior.js').Behavior} bh
 */
export function summary(m, bh) {
  if (!m.n) return '<p class="empty">Немає закритих угод: аналітика рахується за продажами.</p>';
  const few =
    m.n < MIN_TRADES
      ? `<div class="notice warn"><b>Угод лише ${m.n}.</b> Для висновків потрібно хоча б ${MIN_TRADES}: поки що це опис, а не оцінка.</div>`
      : '';
  const totals = Object.entries(m.total)
    .map(([c, v]) => money(v, c))
    .join('<br>');
  return `${few}
    <div class="stats">
      ${stat('Угод', String(m.n), `Прибуткових ${m.wins}, збиткових ${m.losses}<br>${totals}`)}
      ${stat(
        'Частка прибуткових',
        pct(m.winRate),
        ci(bh.winRate, (v) => pct(v)),
      )}
      ${stat(
        'Прибуток / збиток',
        ok(m.payoff) ? `${num(m.payoff, 2)} : 1` : '—',
        `Середній прибуток ${pct(m.avgWin, true)}<br>Середній збиток ${pct(m.avgLoss)}`,
      )}
      ${stat(
        'Очікування угоди',
        `<span class="${sign(m.expectancy)}">${pct(m.expectancy, true)}</span>`,
        `${ci(bh.expectancy, pct)}<br>Середній результат угоди від її розміру, з комісіями`,
      )}
      ${stat(
        'Утримання, медіана',
        `${num(m.days)} дн.`,
        `Прибуткові ${num(m.winDays)} дн.<br>Збиткові ${num(m.lossDays)} дн.`,
      )}
    </div>
    <div class="charts">
      <article class="card chart">
        <h3>Результат угоди</h3>
        ${bars(m.returns, (i) => (i < 4 ? 'neg' : 'pos'))}
      </article>
      <article class="card chart">
        <h3>Час утримання</h3>
        ${bars(m.hold)}
      </article>
    </div>
    <h3 class="section-title">Поведінка</h3>
    <p class="meta">
      Крапка — середній результат угоди в групі, відрізок — 90% bootstrap-інтервал. Якщо відрізок перетинає нуль, дані
      не відрізняють цю групу від нуля. Число біля назви — кількість угод; групи менші за ${MIN_TRADES} бліді.
    </p>
    <div class="charts">
      <article class="card chart"><h3>Після прибутку чи збитку</h3>${intervals(bh.afterLoss)}</article>
      <article class="card chart"><h3>День тижня входу</h3>${intervals(bh.weekday)}</article>
      <article class="card chart"><h3>Результат за часом утримання</h3>${intervals(bh.hold)}</article>
      <article class="card chart"><h3>Ефект диспозиції</h3>${disposition(bh.disposition)}</article>
    </div>`;
}

/**
 * @param {import('../core/analytics/benchmark.js').Benchmark} b
 */
export function bench(b) {
  const period = `Ціни з ${day(b.from)} до ${day(b.to)}`;
  if (!b.n) return `<p class="meta">${period}: жодна угода не потрапляє в цей період.</p>`;
  return `<div class="stats">
      ${stat('Кращі за індекс', pct(b.beat), `з ${b.n} угод`)}
      ${stat(
        'Середня перевага',
        `<span class="${sign(b.excess)}">${pct(b.excess, true)}</span>`,
        'Дохідність угоди мінус дохідність індексу за ті самі дні',
      )}
    </div>
    <p class="meta">${period}.${b.skipped ? ` Поза періодом або без собівартості: ${b.skipped} угод.` : ''}</p>`;
}
