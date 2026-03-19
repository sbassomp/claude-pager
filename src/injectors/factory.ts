import type { InputInjector } from './injector.js';
import { TmuxInjector } from './tmux/injector.js';
import { XdotoolInjector } from './xdotool/injector.js';

export function createInjector(type: 'auto' | 'tmux' | 'xdotool' | 'applescript'): InputInjector {
  switch (type) {
    case 'tmux':
      return new TmuxInjector();
    case 'xdotool':
      return new XdotoolInjector();
    case 'auto':
      // Prefer tmux if available, fallback to xdotool
      if (process.platform === 'linux') {
        return new TmuxInjector();
      }
      throw new Error(`No injector available for platform: ${process.platform}`);
    default:
      throw new Error(`Unknown injector type: ${type}`);
  }
}
