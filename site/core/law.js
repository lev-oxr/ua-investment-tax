// Єдине джерело посилань на ПКУ. Якорі звірено з редакцією від 01.11.2026 (перевірено 07.11.2026).
export const LAW_URL = 'https://zakon.rada.gov.ua/laws/show/2755-17#';

export const LAW = {
  profit: { anchor: 'n3981', label: 'пп. 170.2.2' },
  loss: { anchor: 'n3997', label: 'пп. 170.2.3' },
  wash: { anchor: 'n3998', label: 'пп. 170.2.4' },
  buyback: { anchor: 'n4001', label: 'пп. 170.2.5' },
  yearTotal: { anchor: 'n4005', label: 'пп. 170.2.6' },
  washExempt: { anchor: 'n4017', label: 'пп. 170.2.6 — винятки' },
  identical: { anchor: 'n4028', label: 'пп. 170.2.7 «в»' },
  exemption: { anchor: 'n4029', label: 'пп. 170.2.8' },
  minimum: { anchor: 'n3953', label: 'пп. 169.4.1' },
  fxIncome: { anchor: 'n3690', label: 'п. 164.4' },
  fxDiff: { anchor: 'n13514', label: 'пп. 14.1.96-1' },
  pdfo: { anchor: 'n11196', label: 'пп. 167.5.1' },
  foreign: { anchor: 'n4141', label: 'пп. 170.11.1' },
  divRate: { anchor: 'n14567', label: 'пп. 167.5.4' },
  foreignCredit: { anchor: 'n4144', label: 'пп. 170.11.2' },
  military: { anchor: 'n22758', label: 'п. 16-1 підр. 10 розд. XX' },
  deadline: { anchor: 'n1250', label: 'пп. 49.18.4' },
  payment: { anchor: 'n4362', label: 'п. 179.7' },
};

/**
 * @param {keyof typeof LAW} key
 * @returns {string} посилання на абзац ПКУ
 */
export const lawUrl = (key) => LAW_URL + LAW[key].anchor;
