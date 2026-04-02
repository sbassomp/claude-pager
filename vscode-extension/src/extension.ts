import * as vscode from 'vscode';
import { TerminalTracker } from './terminal-tracker';
import { InjectionServer } from './server';

let server: InjectionServer | undefined;
let tracker: TerminalTracker | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  tracker = new TerminalTracker();
  server = new InjectionServer(tracker);

  const port = await server.start();
  console.log(`[claude-pager] Injection server listening on port ${port}`);

  // Inject CLAUDE_PAGER_VSCODE_PORT into all terminal environments
  context.environmentVariableCollection.replace(
    'CLAUDE_PAGER_VSCODE_PORT',
    String(port),
  );

  // Status bar item
  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.text = `$(terminal) pager:${port}`;
  statusItem.tooltip = 'claude-pager VS Code relay';
  statusItem.command = 'claude-pager.showStatus';
  statusItem.show();

  // Status command
  const statusCmd = vscode.commands.registerCommand('claude-pager.showStatus', () => {
    const sessions = tracker!.sessionCount;
    const terminals = tracker!.terminalCount;
    vscode.window.showInformationMessage(
      `claude-pager relay on port ${port}: ${sessions} session(s), ${terminals} terminal(s) tracked`,
    );
  });

  context.subscriptions.push(
    statusItem,
    statusCmd,
    { dispose: () => server?.stop() },
    { dispose: () => tracker?.dispose() },
  );
}

export function deactivate(): void {
  server?.stop();
  tracker?.dispose();
}
