import type { InputInjector } from './injector.js';
import { TmuxInjector } from './tmux/injector.js';
import { XdotoolInjector } from './xdotool/injector.js';
import { VscodeInjector } from './vscode/injector.js';
import { CompositeInjector } from './composite.js';

export function createInjector(type: 'auto' | 'tmux' | 'xdotool' | 'applescript'): InputInjector {
  const vscode = new VscodeInjector();

  switch (type) {
    case 'tmux':
      return new CompositeInjector([vscode, new TmuxInjector()]);
    case 'xdotool':
      return new CompositeInjector([vscode, new XdotoolInjector()]);
    case 'auto':
      if (process.platform === 'linux') {
        return new CompositeInjector([vscode, new TmuxInjector()]);
      }
      // On non-Linux (macOS/Windows), VS Code injector is the only option
      return new CompositeInjector([vscode]);
    default:
      throw new Error(`Unknown injector type: ${type}`);
  }
}
