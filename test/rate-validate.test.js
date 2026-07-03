import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRatePayload } from '../lib/rate-validate.js';

test('valid payload returns null', () => {
  assert.equal(validateRatePayload({ url: 'https://example.com', rating: 3 }), null);
});

test('rating 1 is valid', () => {
  assert.equal(validateRatePayload({ url: 'https://example.com', rating: 1 }), null);
});

test('rating 5 is valid', () => {
  assert.equal(validateRatePayload({ url: 'https://example.com', rating: 5 }), null);
});

test('null payload fails', () => {
  assert.ok(validateRatePayload(null));
});

test('undefined payload fails', () => {
  assert.ok(validateRatePayload(undefined));
});

test('rating 0 fails', () => {
  assert.ok(validateRatePayload({ url: 'https://example.com', rating: 0 }));
});

test('rating 6 fails', () => {
  assert.ok(validateRatePayload({ url: 'https://example.com', rating: 6 }));
});

test('rating 9999 fails', () => {
  assert.ok(validateRatePayload({ url: 'https://example.com', rating: 9999 }));
});

test('rating -5 fails', () => {
  assert.ok(validateRatePayload({ url: 'https://example.com', rating: -5 }));
});

test('non-integer rating fails', () => {
  assert.ok(validateRatePayload({ url: 'https://example.com', rating: 3.5 }));
});

test('ftp URL fails', () => {
  assert.ok(validateRatePayload({ url: 'ftp://example.com', rating: 3 }));
});

test('invalid URL fails', () => {
  assert.ok(validateRatePayload({ url: 'not-a-url', rating: 3 }));
});

test('http URL is valid', () => {
  assert.equal(validateRatePayload({ url: 'http://example.com', rating: 3 }), null);
});
