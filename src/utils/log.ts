import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_DIR = join(homedir(), '.claude-pager');

function appendLine(file: string, parts: string[]): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(join(DATA_DIR, file), `${new Date().toISOString()} ${parts.join(' ')}\n`);
  } catch {
    // never let logging break operation
  }
}

export function logHook(...parts: string[]): void {
  appendLine('hook.log', parts);
}

export function logDaemon(...parts: string[]): void {
  appendLine('daemon.log', parts);
}
