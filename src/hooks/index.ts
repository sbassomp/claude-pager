#!/usr/bin/env node

import { registerSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';
import type { SessionInfo } from '../types.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function handleSessionStart(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  const info: SessionInfo = {
    sessionId: data.session_id,
    pid: process.ppid,
    tty: process.env.TTY || '',
    cwd: data.cwd || process.cwd(),
    timestamp: Date.now(),
  };

  ensureDataDir();
  registerSession(info);
}

async function handleNotification(): Promise<void> {
  const input = await readStdin();

  // Forward to daemon
  try {
    const res = await fetch('http://127.0.0.1:17380/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: input,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error(`[hook] daemon responded ${res.status}`);
    }
  } catch (err) {
    console.error('[hook] daemon unreachable:', err);
  }
}

const command = process.argv[2];

switch (command) {
  case 'session-start':
    handleSessionStart().catch(err => {
      console.error('[hook] session-start error:', err);
      process.exit(1);
    });
    break;
  case 'notification':
    handleNotification().catch(err => {
      console.error('[hook] notification error:', err);
      process.exit(1);
    });
    break;
  default:
    console.error(`Usage: claude-relay-hook <session-start|notification>`);
    process.exit(1);
}
