// Чисті функції: дані → HTML-рядок. Усе, що прийшло з файлу, проходить через esc().
import { LAW, lawUrl } from '../core/law.js';
import { isExchange } from '../core/exchanges.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @param {unknown} s */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const num = (n, min, max) => n.toLocaleString('uk-UA', { minimumFractionDigits: min, maximumFractionDigits: max });
export const fmt = (n) => num(n, 2, 2);
export const uah = (n) => `${fmt(n)} ₴`;
export const rate4 = (n) => num(n, 4, 4);
export const qty = (n) => num(n, 0, 8);
const cur = (n, c) => `${num(n, 2, 4)} ${esc(c)}`;
const cents = (n, c) => `${fmt(n)} ${esc(c)}`;
const pct = (r) => `${(r * 100).toLocaleString('uk-UA')}%`;
const sign = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
// Дата з виписки (РРРР-ММ-ДД) у звичному вигляді: 2025-03-10 → 10.03.2025
const day = (d) => esc(String(d).split('-').reverse().join('.'));

/** @param {keyof typeof LAW} key @param {string} [label] */
export const ref = (key, label = LAW[key].label) =>
  `<a class="ref" target="_blank" rel="noopener" href="${lawUrl(key)}">${label}</a>`;

const venue = (code) =>
  !code ? 'майданчик невідомий' : `${esc(code)}, ${isExchange(code) ? 'біржа' : 'не в списку бірж'}`;
const venues = (r) => [r.exchange, ...r.wash.map((w) => w.exchange)];
const offExchange = (r) => venues(r).some((v) => v && !isExchange(v));

/** @param {string[]} items */
export const notice = (items) =>
  items.length > 1 ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : esc(items[0]);

/** @param {{ name: string, trades: unknown[] }[]} parsed */
export const files = (parsed) =>
  parsed.map((p) => `<li><b>${esc(p.name)}</b> · угод: ${p.trades.length}</li>`).join('');

const stat = (label, value, small = '', cls = '') =>
  `<div class="stat card ${cls}"><span>${label}</span><b>${value}</b><small>${small}</small></div>`;

// Продажі, для яких у виписках не знайшлось частини купівель: їх видно, але в підсумок вони не йдуть
const missingNote = (rows) => {
  const missing = rows.filter((r) => r.missing);
  if (!missing.length) return '';
  return `<div class="notice error">
      <b>Підсумок неповний.</b> Не пораховано продажів: ${missing.length}, бо для них бракує купівель:
      <ul>${missing
        .map(
          (r) => `<li>${esc(r.symbol)} ${day(r.date)}: продано ${qty(r.qty)} шт., купівель знайдено на
            ${qty(r.qty - r.missing)} шт., бракує <b>${qty(r.missing)} шт.</b></li>`,
        )
        .join('')}</ul>
      Найімовірніше, ці акції куплено раніше: завантажте разом виписку за попередній рік. <a href="#tab-detail">Детально</a>
    </div>`;
};

/**
 * Вкладка «Розрахунок»: картки, примітки й таблиця продажів року.
 * @param {string} year
 * @param {(import('../core/fifo.js').SaleRow & { wash: { date: string, exchange: string }[] })[]} rows
 * @param {import('../core/tax.js').Totals} t
 */
export function result(year, rows, t) {
  const wash = rows.filter((r) => r.wash.length);
  const anyVenue = wash.some((r) => venues(r).some(Boolean));
  const washNote = !wash.length
    ? ''
    : `<div class="notice warn">
        <b>Правило 30 днів.</b> Продажів зі збитком, біля яких є купівлі тих самих акцій у межах 30 днів: ${wash.length}
        (збиток ${uah(-wash.reduce((a, r) => a + r.result, 0))}). Для біржових угод правило не діє, тому розрахунок ці збитки враховує.
        ${
          anyVenue
            ? `З них з угодами не в списку бірж: <b>${wash.filter(offExchange).length}</b>.`
            : 'Місце виконання невідоме: завантажте Flex Query з полем Exchange, і тут буде видно, які з них пройшли поза біржею.'
        }
        <a href="#tab-detail">Які угоди</a> · <a href="#wash-rule">чому</a>
      </div>`;
  const tag = (r) =>
    r.missing
      ? `<span class="tag bad">бракує ${qty(r.missing)} шт.</span>`
      : r.wash.length
        ? `<span class="tag" title="Купівлі тих самих акцій у межах 30 днів (пп. 170.2.4)">30 днів${offExchange(r) ? ' · не біржа?' : ''}</span>`
        : '';
  const incomplete = rows.filter((r) => r.missing).length;
  const totalNote = [
    incomplete ? `Неповно: не пораховано продажів — ${incomplete}` : '',
    t.lossOut ? `Збиток ${uah(t.lossOut)} переходить на наступні роки` : '',
  ]
    .filter(Boolean)
    .join('<br>');
  return `
    ${missingNote(rows)}
    <div class="stats">
      ${stat(
        'Фінансовий результат',
        `<span class="${sign(t.result)}">${uah(t.result)}</span>`,
        // Дохід і витрати — оборот: кожна угода додає повну суму, тож при частій торгівлі вони великі
        `Продано на ${uah(t.income)}<br>Витрати на них ${uah(t.expense)}${
          t.lossIn ? `<br>Збиток минулих років −${uah(t.lossIn)}` : ''
        }<br><i>Це оборот за рік, а не гроші на рахунку</i>`,
      )}
      ${stat('ПДФО 18%', uah(t.pdfo))}
      ${stat(`Військовий збір ${pct(t.milRate)}`, uah(t.military))}
      ${stat('Разом до сплати', uah(t.pdfo + t.military), totalNote, 'total')}
    </div>
    ${
      year === '2024'
        ? '<p class="yearnote">Для 2024 року перевірте ставку військового збору: 5% діє з 01.12.2024 (Закон № 4015-IX), до того — 1,5%. Тут застосовано 5%.</p>'
        : ''
    }
    ${washNote}
    <div class="card wrap">
      <table>
        <thead><tr>
          <th class="l">Дата продажу</th><th class="l">Тікер</th><th>К-сть</th><th>Курс НБУ</th>
          <th>Дохід, ₴</th><th>Витрати, ₴</th><th>Результат, ₴</th><th class="l">Лоти купівлі</th>
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td class="l">${day(r.date)}</td><td class="l sym">${esc(r.symbol)}${tag(r)}</td><td>${qty(r.qty)}</td>
              <td>${rate4(r.rate)} <span class="dim">${esc(r.currency)}</span></td>
              ${
                r.missing
                  ? '<td class="neg" colspan="3">не пораховано</td>'
                  : `<td>${fmt(r.income)}</td><td>${fmt(r.expense)}</td><td class="${sign(r.result)}">${fmt(r.result)}</td>`
              }
              <td class="l dim lots-col">${[...new Set(r.lots.map((l) => l.date))].map(day).join(', ')}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>`;
}

const step = (label, value, refs, cls = '') =>
  `<div class="step ${cls}"><span>${label}</span><span class="v">${value}</span><span class="r">${refs}</span></div>`;

/**
 * Вкладка «Детально»: підсумок року по кроках і картка на кожен продаж.
 * @param {string} year
 * @param {(import('../core/fifo.js').SaleRow & { wash: { date: string, exchange: string }[] })[]} rows
 * @param {import('../core/tax.js').Totals} t
 */
export function detail(year, rows, t) {
  const steps = [
    step(
      `Сума результатів усіх продажів за ${esc(year)} (прибутки мінус збитки)`,
      uah(t.result),
      ref('yearTotal', 'пп. 170.2.6, абз. 2'),
    ),
    t.lossIn
      ? step('Мінус непогашений збиток минулих років', `−${uah(t.lossIn)}`, ref('yearTotal', 'пп. 170.2.6, абз. 3'))
      : '',
    step('Загальний фінансовий результат — база оподаткування', uah(t.base), ref('yearTotal', 'пп. 170.2.6, абз. 1')),
    step(`ПДФО: 18% × ${uah(t.base)}`, uah(t.pdfo), ref('pdfo')),
    step(`Військовий збір: ${pct(t.milRate)} × ${uah(t.base)}`, uah(t.military), ref('military')),
    step(
      'Разом до сплати',
      uah(t.pdfo + t.military),
      `${ref('deadline', 'декларація до 1 травня')} ${ref('payment', 'сплата до 1 серпня')}`,
      'total',
    ),
    t.lossOut
      ? step('Збиток, що переходить на наступні роки', uah(t.lossOut), ref('yearTotal', 'пп. 170.2.6, абз. 3'))
      : '',
  ].join('');

  const gap = (r) => `
    <article class="card sale missing">
      <header>
        <b>${esc(r.symbol)}</b><span class="dim">продаж ${day(r.date)} · ${qty(r.qty)} шт.</span>
        <span class="res neg">Не пораховано</span>
      </header>
      <section class="part lots">
        <h4>Бракує купівель на ${qty(r.missing)} шт.</h4>
        <p>Продано ${qty(r.qty)} шт., а в завантажених виписках знайдено купівель лише на ${qty(r.qty - r.missing)} шт.
          Без дати й ціни решти купівель витрати на цей продаж порахувати неможливо, тому він не входить у підсумок року.</p>
        <div class="wrap"><table>
          <thead><tr><th class="l">Що</th><th>К-сть</th><th>Ціна купівлі</th><th>Курс НБУ</th></tr></thead>
          <tbody>
            ${r.lots
              .map(
                (l) => `<tr><td class="l">Купівля ${day(l.date)}</td><td>${qty(l.qty)}</td>
                  <td>${cur(l.price, l.currency)}</td><td>${rate4(l.rate)}</td></tr>`,
              )
              .join('')}
            <tr class="gap"><td class="l">Купівлю не знайдено</td><td>${qty(r.missing)}</td><td>?</td><td>?</td></tr>
          </tbody>
        </table></div>
      </section>
      <section class="part">
        <p><b>Що зробити:</b> завантажте разом виписку за рік, коли купували ${esc(r.symbol)}, або додайте ці купівлі
          власним CSV (<a href="sample.csv" download>зразок</a>) з колонками date,type,symbol,qty,price,currency,fee.</p>
      </section>
    </article>`;

  const sale = (r) => {
    if (r.missing) return gap(r);
    const gross = r.qty * r.price;
    // Результат у валюті — лише для порівняння: податок рахується в гривнях
    const sameCurrency = r.lots.every((l) => l.currency === r.currency);
    const costCur = r.lots.reduce((a, l) => a + l.qty * l.price + l.fee, 0) + r.fee;
    return `
    <article class="card sale">
      <header>
        <b>${esc(r.symbol)}</b><span class="dim">продаж ${day(r.date)} · ${qty(r.qty)} шт.</span>
        <span class="res ${sign(r.result)}">${r.result < 0 ? 'Збиток' : 'Прибуток'} ${uah(Math.abs(r.result))}</span>
      </header>
      ${
        r.wash.length
          ? `<p class="part washline">Продаж: ${venue(r.exchange)}. Купівлі ${esc(r.symbol)} у межах 30 днів від продажу:
              ${r.wash.map((w) => `${day(w.date)} (${venue(w.exchange)})`).join('; ')}.<br>
              Якщо до цієї угоди застосовується правило 30 днів, збиток ${uah(-r.result)} не враховується, а вартість нового пакета
              не може бути нижчою за ціну проданого. ${ref('wash')} <a href="#wash-rule">Коли правило не діє</a></p>`
          : ''
      }
      <section class="part">
        <h4>1. Отримали за продаж ${ref('fxIncome')}</h4>
        <p>${qty(r.qty)} шт. × ${cur(r.price, r.currency)} <span class="dim">(ціна продажу)</span> = ${cur(gross, r.currency)}</p>
        <p>${cur(gross, r.currency)} × ${rate4(r.rate)} <span class="dim">(курс НБУ на ${day(r.date)})</span> = <b>${uah(r.income)}</b></p>
      </section>
      <section class="part lots">
        <h4>2. Витратили на ці акції ${ref('profit')}</h4>
        <p class="dim">Кожна купівля — за курсом НБУ на день купівлі. Першими списуються найстаріші купівлі (FIFO),
          комісія купівлі — пропорційно до проданої кількості.</p>
        <div class="wrap"><table>
          <thead><tr><th class="l">Що</th><th>К-сть</th><th>Ціна купівлі</th><th>Комісія</th><th>Разом у валюті</th><th>Курс НБУ</th><th>Разом, ₴</th></tr></thead>
          <tbody>
            ${r.lots
              .map(
                (
                  l,
                ) => `<tr><td class="l">Купівля ${day(l.date)}</td><td>${qty(l.qty)}</td><td>${cur(l.price, l.currency)}</td>
                  <td>${cur(l.fee, l.currency)}</td><td>${cur(l.qty * l.price + l.fee, l.currency)}</td>
                  <td>${rate4(l.rate)}</td><td>${fmt(l.cost)}</td></tr>`,
              )
              .join('')}
            <tr><td class="l">Комісія продажу ${day(r.date)}</td><td></td><td></td><td>${cur(r.fee, r.currency)}</td>
              <td>${cur(r.fee, r.currency)}</td><td>${rate4(r.rate)}</td><td>${fmt(r.feeUah)}</td></tr>
          </tbody>
          <tfoot><tr><td class="l" colspan="6">Витрати разом</td><td>${uah(r.expense)}</td></tr></tfoot>
        </table></div>
      </section>
      <section class="part">
        <h4>3. Результат ${ref('profit')} ${ref('loss')}</h4>
        <p>${uah(r.income)} − ${uah(r.expense)} = <b class="${sign(r.result)}">${uah(r.result)}</b></p>
        ${
          sameCurrency
            ? `<p class="dim">Для порівняння, у валюті: ${cents(gross, r.currency)} − ${cents(costCur, r.currency)} = ${cents(gross - costCur, r.currency)}.
                Різниця з гривневим результатом — це зміна курсу НБУ між купівлею і продажем.</p>`
            : ''
        }
      </section>
    </article>`;
  };

  return `${missingNote(rows)}<div class="card steps">${steps}</div><h2 class="section-title">Кожен продаж</h2>${rows.map(sale).join('')}`;
}

// Поле CSV у лапках, якщо в ньому є кома, лапки чи перенос рядка
const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));

/**
 * Експорт продажів року в CSV (числа з крапкою, щоб файл читали таблиці будь-якої локалі).
 * @param {(import('../core/fifo.js').SaleRow & { wash: { date: string, exchange: string }[] })[]} rows
 * @returns {string}
 */
export function csv(rows) {
  const head = 'date,symbol,qty,currency,nbu_rate,income_uah,expense_uah,result_uah,buy_dates,buys_within_30_days';
  // Продажі без знайдених купівель не пораховані, тож в експорт не йдуть
  const lines = rows
    .filter((r) => !r.missing)
    .map((r) =>
      [
        r.date,
        r.symbol,
        r.qty,
        r.currency,
        r.rate,
        r.income.toFixed(2),
        r.expense.toFixed(2),
        r.result.toFixed(2),
        [...new Set(r.lots.map((l) => l.date))].join(' '),
        r.wash.map((w) => `${w.date}${w.exchange ? `@${w.exchange}` : ''}`).join(' '),
      ]
        .map(cell)
        .join(','),
    );
  return [head, ...lines].join('\n') + '\n';
}
