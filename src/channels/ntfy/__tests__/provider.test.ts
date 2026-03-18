import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NtfyProvider } from '../provider.js';

describe('NtfyProvider', () => {
  describe('send', () => {
    it('should report error when server is unreachable', async () => {
      const provider = new NtfyProvider({
        server: 'http://127.0.0.1:19999',
        topic: 'test',
      });

      const result = await provider.send(
        {
          id: 'evt-1',
          sessionId: 'sess-1',
          type: 'permission_prompt',
          message: 'Allow Bash(git status)?',
          project: '/home/user/dev/myproject',
          timestamp: Date.now(),
        },
        '1',
      );

      assert.equal(result.success, false);
      assert.ok(result.error);
    });
  });
});
