import { parseFile, mergeFiles } from './core/brokers/index.js';
import { fifo } from './core/fifo.js';
import { markWash } from './core/wash.js';
import { yearly, totals } from './core/tax.js';
import { dividendRows, dividendTotals } from './core/dividends.js';
import { lawUrl } from './core/law.js';
import { getRates } from './nbu.js';
import * as ui from './ui/render.js';
import { roundtrips } from './core/analytics/roundtrips.js';
import { metrics } from './core/analytics/metrics.js';
import { behavior } from './core/analytics/behavior.js';
import { parsePrices, benchmark } from './core/analytics/benchmark.js';
import * as an from './ui/analytics.js';

const $ = (id) => document.getElementById(id);
const yearSelects = [...document.querySelectorAll('select.year')];
let rows = [];
let divs = [];
let trips = [];
let prices = null;

for (const a of document.querySelectorAll('a[data-law]')) {
  a.href = lawUrl(a.dataset.law);
  a.target = '_blank';
  a.rel = 'noopener';
}

const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
}
for (const t of tabs) t.addEventListener('click', () => selectTab(t));
document.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
  const i = tabs.indexOf(document.activeElement);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (i < 0 || next === undefined) return;
  e.preventDefault();
  const tab = tabs[(next + tabs.length) % tabs.length];
  selectTab(tab);
  tab.focus();
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const target = a && document.getElementById(a.hash.slice(1));
  const panel = target?.closest('[role=tabpanel]');
  if (!panel) return;
  e.preventDefault();
  selectTab(tabs.find((t) => t.getAttribute('aria-controls') === panel.id));
  target.scrollIntoView({ behavior: 'smooth' });
});

function notice(id, items) {
  $(id).hidden = !items.length;
  $(id).innerHTML = ui.notice(items);
}

async function load(files) {
  notice('err', []);
  notice('warn', []);
  try {
    const parsed = await Promise.all(
      [...files].map(async (f) => {
        try {
          return { name: f.name, ...parseFile(await f.text()) };
        } catch (e) {
          throw new Error(`${f.name}: ${e.message}`, { cause: e });
        }
      }),
    );
    const { trades, cash, warnings } = mergeFiles(parsed);
    $('files').innerHTML = ui.files(parsed);
    notice('warn', warnings);
    if (!trades.length) throw new Error('У файлах не знайдено жодної угоди з акціями.');

    $('report').hidden = false;
    $('loading').hidden = false;
    $('result').hidden = true;
    const rate = await getRates([...trades, ...cash], {
      onProgress: (i, n) => {
        $('bar').max = n;
        $('bar').value = i;
        $('status').textContent = `Завантажую курси НБУ: ${i} з ${n}`;
      },
    });
    // Якщо бракує ранніх купівель, решту все одно рахуємо, а такі продажі позначаємо на сторінці
    rows = markWash(fifo(trades, rate, { allowMissing: true }), trades);
    divs = dividendRows(cash, rate);
    const years = [...new Set([...Object.keys(yearly(rows)), ...divs.map((d) => d.date.slice(0, 4))])].sort().reverse();
    if (!years.length) throw new Error('У файлах є лише купівлі, продажів і дивідендів немає — оподатковувати нічого.');

    const last = String(new Date().getFullYear() - 1);
    const pick = years.includes(last) ? last : years[0];
    for (const s of yearSelects) {
      s.innerHTML = years.map((y) => `<option>${y}</option>`).join('');
      s.value = pick;
    }
    $('loading').hidden = true;
    $('result').hidden = false;
    for (const id of ['detail', 'decl', 'an']) {
      $(`${id}Empty`).hidden = true;
      $(`${id}Body`).hidden = false;
    }
    render();
    trips = roundtrips(rows);
    renderAnalytics();
  } catch (e) {
    $('report').hidden = true;
    notice('err', [e.message]);
  }
}

const yearRows = (year) => rows.filter((r) => r.date.startsWith(year));

function render() {
  const year = yearSelects[0].value;
  // Перемикач має сенс лише там, де є що переносити; сума показує, скільки саме віднімається
  const prior = yearly(rows)[year]?.lossIn ?? 0;
  $('carryBox').hidden = !prior;
  $('carryAmount').textContent = ui.uah(prior);
  // ponytail: рік лише з дивідендами показує продажі нулями, без збитку минулих років у рядку 2 Ф1
  const t = yearly(rows, { carryLoss: $('carry').checked })[year] ?? totals([], 0, year);
  const yearDivs = divs.filter((d) => d.date.startsWith(year));
  const d = dividendTotals(yearDivs, year);
  $('result').innerHTML = ui.result(year, yearRows(year), t, d) + ui.dividends(yearDivs, d);
  $('detail').innerHTML = ui.detail(year, yearRows(year), t);
  $('decl').innerHTML = ui.declaration(year, yearRows(year), t, d);
}

$('carry').addEventListener('change', render);

function renderAnalytics() {
  $('analytics').innerHTML = an.summary(metrics(trips), behavior(trips));
  $('bench').innerHTML = prices ? an.bench(benchmark(trips, prices)) : '';
}

$('benchFile').addEventListener('change', async (e) => {
  const [f] = e.target.files;
  e.target.value = '';
  if (!f) return;
  notice('benchErr', []);
  try {
    prices = parsePrices(await f.text());
  } catch (err) {
    prices = null;
    notice('benchErr', [`${f.name}: ${err.message}`]);
  }
  renderAnalytics();
});

for (const s of yearSelects) {
  s.addEventListener('change', () => {
    for (const o of yearSelects) o.value = s.value;
    render();
  });
}

$('csv').addEventListener('click', () => {
  const year = yearSelects[0].value;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ui.csv(yearRows(year))], { type: 'text/csv' }));
  a.download = `investment-${year}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
});

$('print').addEventListener('click', () => window.print());

$('file').addEventListener('change', (e) => {
  if (e.target.files.length) load(e.target.files);
  e.target.value = '';
});
const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  load(e.dataTransfer.files);
});
