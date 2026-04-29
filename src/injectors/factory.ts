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
      // tmux is cross-platform; TmuxInjector.resolve() returns false cleanly
      // when tmux is absent, so the composite falls through to vscode.
      return new CompositeInjector([vscode, new TmuxInjector()]);
    default:
      throw new Error(`Unknown injector type: ${type}`);
  }
}
