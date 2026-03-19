import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeJsonParse } from '../json.js';

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"a":1}', {});
    assert.deepEqual(result, { a: 1 });
  });

  it('should return fallback for invalid JSON', () => {
    const result = safeJsonParse('not json', { fallback: true });
    assert.deepEqual(result, { fallback: true });
  });

  it('should return fallback for empty string', () => {
    const result = safeJsonParse('', null);
    assert.equal(result, null);
  });

  it('should parse arrays', () => {
    const result = safeJsonParse<number[]>('[1,2,3]', []);
    assert.deepEqual(result, [1, 2, 3]);
  });
});
