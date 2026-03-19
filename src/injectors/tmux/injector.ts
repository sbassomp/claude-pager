import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InputInjector } from '../injector.js';
import type { EventType, SessionInfo } from '../../types.js';

const exec = promisify(execFile);

export class TmuxInjector implements InputInjector {
  readonly name = 'tmux';

  async resolve(session: SessionInfo): Promise<boolean> {
    if (!session.tmuxPane) return false;
    try {
      await exec('tmux', ['has-session', '-t', session.tmuxPane]);
      return true;
    } catch {
      return false;
    }
  }

  async sendResponse(session: SessionInfo, text: string, eventType: EventType): Promise<boolean> {
    if (!session.tmuxPane) return false;
    const pane = session.tmuxPane;

    try {
      if (eventType === 'permission_prompt') {
        return await this.handlePermissionPrompt(pane, text);
      }
      // For other prompts (idle_prompt, etc.), type the text + Enter
      await exec('tmux', ['send-keys', '-t', pane, text, 'Enter']);
      return true;
    } catch (err) {
      console.error('[tmux] sendResponse error:', err);
      return false;
    }
  }

  private async handlePermissionPrompt(pane: string, text: string): Promise<boolean> {
    const lower = text.toLowerCase().trim();

    if (['allow', 'yes', 'y'].includes(lower)) {
      // Option 1 "Yes" is always first and already selected — just press Enter
      await exec('tmux', ['send-keys', '-t', pane, 'Enter']);
    } else if (['deny', 'no', 'n'].includes(lower)) {
      // "No" is always the last option — End jumps to it
      await exec('tmux', ['send-keys', '-t', pane, 'End', 'Enter']);
    } else {
      // Free text — type it and press Enter
      await exec('tmux', ['send-keys', '-t', pane, text, 'Enter']);
    }
    return true;
  }
}
