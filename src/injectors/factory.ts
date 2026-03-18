import type { InputInjector } from './injector.js';
import { XdotoolInjector } from './xdotool/injector.js';

export function createInjector(type: 'auto' | 'xdotool' | 'applescript'): InputInjector {
  if (type === 'auto') {
    if (process.platform === 'linux') {
      return new XdotoolInjector();
    }
    throw new Error(`No injector available for platform: ${process.platform}`);
  }

  switch (type) {
    case 'xdotool':
      return new XdotoolInjector();
    default:
      throw new Error(`Unknown injector type: ${type}`);
  }
}
