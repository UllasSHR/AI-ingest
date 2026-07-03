import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseJSON,
  normalizeChosenIndices,
  validateBrief,
  newestScrapeFile,
} from '../brain.js';

// ---------- parseJSON ----------
test('parseJSON: bare array', () => {
  assert.deepEqual(parseJSON('[1, 2, 3]'), [1, 2, 3]);
});

test('parseJSON: fenced with language tag', () => {
  assert.deepEqual(parseJSON('```json\n[1, 2, 3]\n```'), [1, 2, 3]);
});

test('parseJSON: fenced without language tag', () => {
  assert.deepEqual(parseJSON('```\n{"a":1}\n```'), { a: 1 });
});

test('parseJSON: prose before and after JSON', () => {
  assert.deepEqual(parseJSON('Here you go:\n[1, 2, 3]\nDone.'), [1, 2, 3]);
});

test('parseJSON: object with indices key', () => {
  assert.deepEqual(parseJSON('{"indices": [1,2,3]}'), { indices: [1, 2, 3] });
});

// ---------- normalizeChosenIndices ----------
test('normalizeChosenIndices: bare array passes through', () => {
  assert.deepEqual(normalizeChosenIndices([0, 1, 2], 5), [0, 1, 2]);
});

test('normalizeChosenIndices: {"indices":[...]} object', () => {
  assert.deepEqual(normalizeChosenIndices({ indices: [0, 1, 2] }, 5), [0, 1, 2]);
});

test('normalizeChosenIndices: {"chosen":[...]} object', () => {
  assert.deepEqual(normalizeChosenIndices({ chosen: [0, 1] }, 5), [0, 1]);
});

test('normalizeChosenIndices: drops out-of-range indices', () => {
  assert.deepEqual(normalizeChosenIndices([0, 10, 2], 5), [0, 2]);
});

test('normalizeChosenIndices: coerces numeric strings', () => {
  assert.deepEqual(normalizeChosenIndices(['0', '1', '2'], 5), [0, 1, 2]);
});

test('normalizeChosenIndices: non-array object without array values → []', () => {
  assert.deepEqual(normalizeChosenIndices({ key: 'value' }, 5), []);
});

test('normalizeChosenIndices: null → []', () => {
  assert.deepEqual(normalizeChosenIndices(null, 5), []);
});

// ---------- validateBrief ----------
test('validateBrief: valid brief passes and date is overwritten', () => {
  const b = {
    date: '2026-01-01',
    items: [{ title: 'T', url: 'https://x.com', why_it_matters: 'W' }],
  };
  assert.equal(validateBrief(b, '2026-07-03'), true);
  assert.equal(b.date, '2026-07-03');
});

test('validateBrief: empty items array is valid', () => {
  const b = { items: [] };
  assert.equal(validateBrief(b, '2026-07-03'), true);
});

test('validateBrief: missing items property → false', () => {
  assert.equal(validateBrief({ date: '2026-01-01' }, '2026-07-03'), false);
});

test('validateBrief: item missing url → false', () => {
  const b = { items: [{ title: 'T', why_it_matters: 'W' }] };
  assert.equal(validateBrief(b, '2026-07-03'), false);
});

test('validateBrief: item missing title → false', () => {
  const b = { items: [{ url: 'https://x.com', why_it_matters: 'W' }] };
  assert.equal(validateBrief(b, '2026-07-03'), false);
});

test('validateBrief: item with blank title → false', () => {
  const b = { items: [{ title: '  ', url: 'https://x.com', why_it_matters: 'W' }] };
  assert.equal(validateBrief(b, '2026-07-03'), false);
});

test('validateBrief: item missing why_it_matters → false', () => {
  const b = { items: [{ title: 'T', url: 'https://x.com' }] };
  assert.equal(validateBrief(b, '2026-07-03'), false);
});

test('validateBrief: null → false', () => {
  assert.equal(validateBrief(null, '2026-07-03'), false);
});

// ---------- newestScrapeFile ----------
test('newestScrapeFile: returns the newest date-stamped .json file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-ingest-test-'));
  try {
    await fs.writeFile(path.join(dir, '2026-06-01.json'), '{}');
    await fs.writeFile(path.join(dir, '2026-06-03.json'), '{}');
    await fs.writeFile(path.join(dir, '2026-06-02.json'), '{}');
    // These should be excluded by the regex:
    await fs.writeFile(path.join(dir, '2026-06-02.brief.json'), '{}');
    await fs.writeFile(path.join(dir, 'seen.json'), '{}');
    await fs.writeFile(path.join(dir, 'feedback.json'), '{}');
    const result = await newestScrapeFile(dir);
    assert.equal(result, path.join(dir, '2026-06-03.json'));
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('newestScrapeFile: throws when no scrape files exist', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-ingest-test-'));
  try {
    await fs.writeFile(path.join(dir, 'seen.json'), '{}');
    await assert.rejects(() => newestScrapeFile(dir), /No scrape files/);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
