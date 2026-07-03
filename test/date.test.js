import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayStamp } from '../lib/date.js';

test('todayStamp returns YYYY-MM-DD format', () => {
  assert.match(todayStamp(), /^\d{4}-\d{2}-\d{2}$/);
});

test('todayStamp matches new Date UTC slice', () => {
  assert.equal(todayStamp(), new Date().toISOString().slice(0, 10));
});
