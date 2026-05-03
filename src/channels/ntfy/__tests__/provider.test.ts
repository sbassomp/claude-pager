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

  describe('insecure ntfy.sh guard', () => {
    it('refuses default ntfy.sh topic without auth', () => {
      assert.throws(
        () => new NtfyProvider({ server: 'https://ntfy.sh', topic: 'claude-pager' }),
        /Refusing to start/,
      );
    });

    it('accepts ntfy.sh with a token', () => {
      assert.doesNotThrow(
        () => new NtfyProvider({ server: 'https://ntfy.sh', topic: 't', token: 'tk_x' }),
      );
    });

    it('accepts ntfy.sh with basic auth', () => {
      assert.doesNotThrow(
        () => new NtfyProvider({ server: 'https://ntfy.sh', topic: 't', user: 'u', password: 'p' }),
      );
    });

    it('accepts self-hosted server without auth', () => {
      assert.doesNotThrow(
        () => new NtfyProvider({ server: 'https://ntfy.example.com', topic: 't' }),
      );
    });

    it('honors allowInsecure escape hatch', () => {
      assert.doesNotThrow(
        () => new NtfyProvider({ server: 'https://ntfy.sh', topic: 't', allowInsecure: true }),
      );
    });

    it('honors CLAUDE_PAGER_ALLOW_INSECURE_NTFY env var', () => {
      const prev = process.env.CLAUDE_PAGER_ALLOW_INSECURE_NTFY;
      process.env.CLAUDE_PAGER_ALLOW_INSECURE_NTFY = '1';
      try {
        assert.doesNotThrow(
          () => new NtfyProvider({ server: 'https://ntfy.sh', topic: 't' }),
        );
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PAGER_ALLOW_INSECURE_NTFY;
        else process.env.CLAUDE_PAGER_ALLOW_INSECURE_NTFY = prev;
      }
    });
  });
});
