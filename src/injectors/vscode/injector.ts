import type { InputInjector } from '../injector.js';
import type { SessionInfo, EventType } from '../../types.js';

export class VscodeInjector implements InputInjector {
  readonly name = 'vscode';

  async resolve(session: SessionInfo): Promise<boolean> {
    if (!session.vscodePort) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${session.vscodePort}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async sendResponse(session: SessionInfo, text: string, eventType: EventType): Promise<boolean> {
    if (!session.vscodePort) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${session.vscodePort}/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, text, eventType }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      console.error('[vscode] sendResponse error:', err);
      return false;
    }
  }
}
