import * as vscode from 'vscode';

export class TerminalTracker {
  private pidMap = new Map<number, vscode.Terminal>();
  private sessionMap = new Map<string, vscode.Terminal>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Index existing terminals
    for (const terminal of vscode.window.terminals) {
      this.trackTerminal(terminal);
    }

    // Track new terminals
    this.disposables.push(
      vscode.window.onDidOpenTerminal(t => this.trackTerminal(t)),
      vscode.window.onDidCloseTerminal(t => this.untrackTerminal(t)),
    );
  }

  private trackTerminal(terminal: vscode.Terminal): void {
    terminal.processId.then(pid => {
      if (pid) this.pidMap.set(pid, terminal);
    });
  }

  private untrackTerminal(terminal: vscode.Terminal): void {
    for (const [pid, t] of this.pidMap) {
      if (t === terminal) this.pidMap.delete(pid);
    }
    for (const [sid, t] of this.sessionMap) {
      if (t === terminal) this.sessionMap.delete(sid);
    }
  }

  /** Register a Claude Code session by matching its parent PID to a terminal */
  register(sessionId: string, pid: number): boolean {
    const terminal = this.pidMap.get(pid);
    if (terminal) {
      this.sessionMap.set(sessionId, terminal);
      return true;
    }
    return false;
  }

  /** Get the terminal for a session */
  getTerminal(sessionId: string): vscode.Terminal | undefined {
    return this.sessionMap.get(sessionId);
  }

  /** Number of tracked terminals */
  get terminalCount(): number {
    return this.pidMap.size;
  }

  /** Number of registered sessions */
  get sessionCount(): number {
    return this.sessionMap.size;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
