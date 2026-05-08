import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLoopback,
  parseBasicAuth,
  checkBasicAuth,
  assertDashboardConfig,
} from '../auth.js';

describe('auth', () => {
  describe('isLoopback', () => {
    it('detects 127.0.0.1', () => assert.equal(isLoopback('127.0.0.1'), true));
    it('detects ::1', () => assert.equal(isLoopback('::1'), true));
    it('detects ::ffff:127.0.0.1 (IPv4-mapped)', () => assert.equal(isLoopback('::ffff:127.0.0.1'), true));
    it('rejects LAN address', () => assert.equal(isLoopback('192.168.1.10'), false));
    it('rejects undefined', () => assert.equal(isLoopback(undefined), false));
  });

  describe('parseBasicAuth', () => {
    it('parses valid header', () => {
      const auth = `Basic ${Buffer.from('alice:secret').toString('base64')}`;
      assert.deepEqual(parseBasicAuth(auth), { user: 'alice', password: 'secret' });
    });

    it('rejects missing header', () => assert.equal(parseBasicAuth(undefined), null));
    it('rejects non-Basic scheme', () => assert.equal(parseBasicAuth('Bearer xyz'), null));
    it('rejects malformed payload (no colon)', () => {
      const auth = `Basic ${Buffer.from('nocolonhere').toString('base64')}`;
      assert.equal(parseBasicAuth(auth), null);
    });

    it('preserves password containing colons', () => {
      const auth = `Basic ${Buffer.from('alice:p:a:s:s').toString('base64')}`;
      assert.deepEqual(parseBasicAuth(auth), { user: 'alice', password: 'p:a:s:s' });
    });
  });

  describe('checkBasicAuth', () => {
    const expected = { user: 'alice', password: 'secret' };

    it('accepts correct credentials', () => {
      const auth = `Basic ${Buffer.from('alice:secret').toString('base64')}`;
      assert.equal(checkBasicAuth(auth, expected), true);
    });

    it('rejects wrong password', () => {
      const auth = `Basic ${Buffer.from('alice:wrong').toString('base64')}`;
      assert.equal(checkBasicAuth(auth, expected), false);
    });

    it('rejects wrong user', () => {
      const auth = `Basic ${Buffer.from('bob:secret').toString('base64')}`;
      assert.equal(checkBasicAuth(auth, expected), false);
    });

    it('rejects missing header', () => {
      assert.equal(checkBasicAuth(undefined, expected), false);
    });
  });

  describe('assertDashboardConfig', () => {
    it('accepts no config (defaults to loopback)', () => {
      assert.doesNotThrow(() => assertDashboardConfig(undefined));
    });

    it('accepts loopback bind without auth', () => {
      assert.doesNotThrow(() => assertDashboardConfig({ bind: '127.0.0.1' }));
      assert.doesNotThrow(() => assertDashboardConfig({ bind: 'localhost' }));
      assert.doesNotThrow(() => assertDashboardConfig({ bind: '::1' }));
    });

    it('refuses non-loopback bind without auth', () => {
      assert.throws(
        () => assertDashboardConfig({ bind: '0.0.0.0' }),
        /Refusing to start/,
      );
      assert.throws(
        () => assertDashboardConfig({ bind: '192.168.1.10' }),
        /Refusing to start/,
      );
    });

    it('accepts non-loopback with basicAuth', () => {
      assert.doesNotThrow(
        () => assertDashboardConfig({ bind: '0.0.0.0', basicAuth: { user: 'a', password: 'b' } }),
      );
    });

    it('honors allowInsecure escape hatch', () => {
      assert.doesNotThrow(
        () => assertDashboardConfig({ bind: '0.0.0.0', allowInsecure: true }),
      );
    });
  });
});
