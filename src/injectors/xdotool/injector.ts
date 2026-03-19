import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InputInjector } from '../injector.js';
import type { EventType, SessionInfo } from '../../types.js';

const exec = promisify(execFile);

export class XdotoolInjector implements InputInjector {
  readonly name = 'xdotool';

  async resolve(session: SessionInfo): Promise<boolean> {
    return (await this.findWindow(session)) !== null;
  }

  async sendResponse(session: SessionInfo, text: string, eventType: EventType): Promise<boolean> {
    const windowId = await this.findWindow(session);
    if (!windowId) return false;

    try {
      await exec('xdotool', ['windowactivate', '--sync', String(windowId)]);
      await new Promise(r => setTimeout(r, 100));

      if (eventType === 'permission_prompt') {
        const lower = text.toLowerCase().trim();
        if (['allow', 'yes', 'y'].includes(lower)) {
          await exec('xdotool', ['key', '--window', String(windowId), 'Return']);
        } else if (['deny', 'no', 'n'].includes(lower)) {
          await exec('xdotool', ['key', '--window', String(windowId), 'End', 'Return']);
        } else {
          await exec('xdotool', ['type', '--window', String(windowId), '--clearmodifiers', text]);
          await exec('xdotool', ['key', '--window', String(windowId), 'Return']);
        }
      } else {
        await exec('xdotool', ['type', '--window', String(windowId), '--clearmodifiers', text]);
        await exec('xdotool', ['key', '--window', String(windowId), 'Return']);
      }
      return true;
    } catch (err) {
      console.error('[xdotool] sendResponse error:', err);
      return false;
    }
  }

  private async findWindow(session: SessionInfo): Promise<number | null> {
    if (session.windowId) return session.windowId;
    try {
      const { stdout } = await exec('xdotool', ['search', '--pid', String(session.pid)]);
      const ids = stdout.trim().split('\n').filter(Boolean);
      if (ids.length === 0) return null;
      return parseInt(ids[ids.length - 1], 10);
    } catch {
      return null;
    }
  }
}
