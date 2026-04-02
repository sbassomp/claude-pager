import type { SessionInfo } from '../types.js';

/** Check if a session has a reachable injection target (tmux pane or VS Code extension) */
export function isSessionInjectable(s: SessionInfo): boolean {
  return !!(s.tmuxPane || s.vscodePort);
}
