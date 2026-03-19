import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export function run(args: string[]): void {
  // Generate a session name from cwd
  const project = basename(process.cwd());
  const sessionName = `claude-${project}-${process.pid}`;

  // Build the claude args array (safe from injection)
  const claudeArgs = ['claude', ...args];

  // Check if we're already inside tmux
  if (process.env.TMUX) {
    // Already in tmux — just run claude directly
    console.log(`Already in tmux (pane ${process.env.TMUX_PANE}), launching Claude Code...`);
    execFileSync('claude', args, { stdio: 'inherit' });
    return;
  }

  console.log(`Launching Claude Code in tmux session "${sessionName}"...`);

  try {
    // Create a new tmux session and run claude inside it, then attach
    execFileSync('tmux', [
      'new-session',
      '-s', sessionName,
      ...claudeArgs,
    ], { stdio: 'inherit' });
  } catch {
    // tmux returns non-zero when the session ends normally
  }
}
