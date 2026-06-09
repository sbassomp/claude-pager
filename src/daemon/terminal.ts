import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// tmux pane ids look like %0, %12. Validate before passing to tmux to avoid
// any argument/option injection even though execFile already prevents shell
// interpretation.
const PANE_RE = /^%\d+$/;

export function isValidPane(pane: string): boolean {
  return PANE_RE.test(pane);
}

// Dump a pane's content including scrollback, with ANSI escape sequences (-e)
// so the dashboard can render colors. -S -<lines> sets the scrollback start.
export async function capturePane(pane: string, lines = 3000): Promise<string> {
  if (!isValidPane(pane)) throw new Error('invalid pane');
  const { stdout } = await execFileP(
    'tmux',
    ['capture-pane', '-t', pane, '-p', '-e', '-S', `-${lines}`],
    { timeout: 3000, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

// Send literal text to a pane (-l disables key-name interpretation, -- stops
// option parsing), optionally followed by Enter. Control keys are not sent
// literally: when `enter` is true we append a real Enter key event.
export async function sendKeys(pane: string, keys: string, enter: boolean): Promise<void> {
  if (!isValidPane(pane)) throw new Error('invalid pane');
  if (keys.length > 0) {
    await execFileP('tmux', ['send-keys', '-t', pane, '-l', '--', keys], { timeout: 2000 });
  }
  if (enter) {
    await execFileP('tmux', ['send-keys', '-t', pane, 'Enter'], { timeout: 2000 });
  }
}

// Whitelist of tmux key names the terminal modal can send. Anything else is
// rejected — we don't want the dashboard becoming an arbitrary key-name
// injection surface (e.g. binding-firing keys, command-mode triggers).
const SPECIAL_KEYS: ReadonlySet<string> = new Set([
  'Up', 'Down', 'Left', 'Right',
  'Enter', 'Escape', 'Tab', 'BSpace',
  'PageUp', 'PageDown', 'Home', 'End',
  'C-c', 'C-d', 'C-l',
]);

export function isAllowedSpecialKey(key: string): boolean {
  return SPECIAL_KEYS.has(key);
}

// Send a single tmux key by name (no -l flag, so tmux interprets the name).
export async function sendSpecialKey(pane: string, key: string): Promise<void> {
  if (!isValidPane(pane)) throw new Error('invalid pane');
  if (!isAllowedSpecialKey(key)) throw new Error('key not allowed');
  await execFileP('tmux', ['send-keys', '-t', pane, key], { timeout: 2000 });
}
