import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TmuxInjector } from '../tmux/injector.js';
import type { SessionInfo } from '../../types.js';

const SESSION: SessionInfo = {
  sessionId: 'test-1',
  pid: 1234,
  tty: '',
  cwd: '/tmp',
  tmuxPane: '%99',
  timestamp: Date.now(),
};

describe('TmuxInjector', () => {
  it('should have name "tmux"', () => {
    const injector = new TmuxInjector();
    assert.equal(injector.name, 'tmux');
  });

  it('should return false for resolve when no tmuxPane', async () => {
    const injector = new TmuxInjector();
    const noPane: SessionInfo = { ...SESSION, tmuxPane: undefined };
    assert.equal(await injector.resolve(noPane), false);
  });

  it('should return false for sendResponse when no tmuxPane', async () => {
    const injector = new TmuxInjector();
    const noPane: SessionInfo = { ...SESSION, tmuxPane: undefined };
    assert.equal(await injector.sendResponse(noPane, 'allow', 'permission_prompt'), false);
  });

  it('should return false for resolve on non-existent pane', async () => {
    const injector = new TmuxInjector();
    const fakePaneSession: SessionInfo = { ...SESSION, tmuxPane: '%99999' };
    assert.equal(await injector.resolve(fakePaneSession), false);
  });
});
