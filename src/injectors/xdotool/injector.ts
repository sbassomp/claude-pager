import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InputInjector } from '../injector.js';

const exec = promisify(execFile);

export class XdotoolInjector implements InputInjector {
  readonly name = 'xdotool';

  async findWindow(pid: number): Promise<number | null> {
    try {
      const { stdout } = await exec('xdotool', ['search', '--pid', String(pid)]);
      const ids = stdout.trim().split('\n').filter(Boolean);
      if (ids.length === 0) return null;
      // Return the last window (usually the most relevant terminal)
      return parseInt(ids[ids.length - 1], 10);
    } catch {
      return null;
    }
  }

  async typeText(windowId: number, text: string): Promise<boolean> {
    try {
      // Focus the window first
      await exec('xdotool', ['windowactivate', '--sync', String(windowId)]);
      // Small delay for window activation
      await new Promise(r => setTimeout(r, 100));
      // Type the text
      await exec('xdotool', ['type', '--window', String(windowId), '--clearmodifiers', text]);
      return true;
    } catch (err) {
      console.error('[xdotool] typeText error:', err);
      return false;
    }
  }

  async pressEnter(windowId: number): Promise<boolean> {
    try {
      await exec('xdotool', ['key', '--window', String(windowId), 'Return']);
      return true;
    } catch (err) {
      console.error('[xdotool] pressEnter error:', err);
      return false;
    }
  }
}
