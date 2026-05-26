import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPane } from '../terminal.js';

describe('terminal', () => {
  describe('isValidPane', () => {
    it('accepts %0, %5, %12', () => {
      assert.equal(isValidPane('%0'), true);
      assert.equal(isValidPane('%5'), true);
      assert.equal(isValidPane('%12'), true);
    });

    it('rejects values that could carry tmux options or shell metachars', () => {
      assert.equal(isValidPane(''), false);
      assert.equal(isValidPane('5'), false);
      assert.equal(isValidPane('%'), false);
      assert.equal(isValidPane('%1; rm -rf /'), false);
      assert.equal(isValidPane('-S'), false);
      assert.equal(isValidPane('%1 %2'), false);
    });
  });
});
