import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCsvLine, parseNumber, parseDateTime } from '../site/core/csv.js';

test('splitCsvLine: empty fields and commas', () => {
  assert.deepEqual(splitCsvLine('Trades,Data,"2025-01-15, 10:31:02",,"10,000"'), [
    'Trades',
    'Data',
    '2025-01-15, 10:31:02',
    '',
    '10,000',
  ]);
});

test('splitCsvLine: double quotes inside field', () => {
  assert.deepEqual(splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b']);
});

test('splitCsvLine: BOM on start on file', () => {
  assert.deepEqual(splitCsvLine('\uFEFFdate,type'), ['date', 'type']);
  assert.deepEqual(splitCsvLine('\uFEFF"Header",x'), ['Header', 'x']);
});

test('parseNumber: delimeter, sign, empty', () => {
  assert.equal(parseNumber('10,000'), 10000);
  assert.equal(parseNumber('-1,234.5'), -1234.5);
  assert.equal(parseNumber('0'), 0);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber(undefined)));
  assert.ok(Number.isNaN(parseNumber('abc')));
});

test('parseDateTime: all formats', () => {
  assert.deepEqual(parseDateTime('20250303;093001'), ['2025-03-03', '09:30:01']);
  assert.deepEqual(parseDateTime('2025-03-03;09:30:01'), ['2025-03-03', '09:30:01']);
  assert.deepEqual(parseDateTime('2025-03-03, 09:30:01'), ['2025-03-03', '09:30:01']);
  assert.deepEqual(parseDateTime('03/04/2025'), ['2025-03-04', '']);
  assert.deepEqual(parseDateTime('2025-03-03'), ['2025-03-03', '']);
});

test('parseDateTime: wrong datetime', () => {
  for (const s of ['', 'abc', '2025-02-30', '2025-13-01', '13/01/2025'])
    assert.deepEqual(parseDateTime(s), ['', ''], s);
});
