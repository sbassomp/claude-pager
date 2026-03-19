import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEventType, isValidSessionId } from '../validation.js';

describe('validation utils', () => {
  describe('isValidEventType', () => {
    it('should accept permission_prompt', () => {
      assert.equal(isValidEventType('permission_prompt'), true);
    });

    it('should accept idle_prompt', () => {
      assert.equal(isValidEventType('idle_prompt'), true);
    });

    it('should reject unknown types', () => {
      assert.equal(isValidEventType('invalid'), false);
      assert.equal(isValidEventType(''), false);
      assert.equal(isValidEventType('PERMISSION_PROMPT'), false);
    });
  });

  describe('isValidSessionId', () => {
    it('should accept valid session IDs', () => {
      assert.equal(isValidSessionId('session-1'), true);
      assert.equal(isValidSessionId('abc_def-123'), true);
      assert.equal(isValidSessionId('recovered-42'), true);
    });

    it('should reject invalid session IDs', () => {
      assert.equal(isValidSessionId(''), false);
      assert.equal(isValidSessionId('../etc/passwd'), false);
      assert.equal(isValidSessionId('session id'), false);
      assert.equal(isValidSessionId('a/b'), false);
      assert.equal(isValidSessionId('a;rm -rf /'), false);
    });
  });
});
