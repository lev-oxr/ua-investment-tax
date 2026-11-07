const EXCHANGES = new Set([
  'NYSE',
  'NASDAQ',
  'ISLAND',
  'ARCA',
  'AMEX',
  'BATS',
  'BYX',
  'EDGX',
  'EDGEA',
  'IEX',
  'PSX',
  'BEX',
  'CHX',
  'NYSENAT',
  'MEMX',
  'LTSE',
  'PEARLEQ',
  'IBIS',
  'LSE',
  'SBF',
  'AEB',
  'EBS',
  'BVME',
  'TSE',
  'SEHK',
  'ASX',
]);

/**
 * @param {string | undefined} code
 * @returns {boolean}
 */
export const isExchange = (code) => EXCHANGES.has((code ?? '').toUpperCase());
