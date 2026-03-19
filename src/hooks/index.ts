#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { registerSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';
import type { SessionInfo } from '../types.js';

// Skip if relay is explicitly disabled (e.g. when working on claude-relay itself)
if (process.env.CLAUDE_RELAY_DISABLED) {
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function getActiveWindowId(): number | undefined {
  try {
    const out = execFileSync('xdotool', ['getactivewindow'], { timeout: 2000 });
    return parseInt(out.toString().trim(), 10) || undefined;
  } catch {
    return undefined;
  }
}

function extractToolContext(transcriptPath: string): { toolName?: string; toolInput?: string } {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    // Read last few lines to find the tool_use block
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        // Look for assistant message with tool_use content
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              const input = block.input;
              let toolInput: string | undefined;
              if (input?.command) {
                toolInput = input.command;
              } else if (input?.file_path) {
                toolInput = input.file_path;
              } else if (input?.content) {
                toolInput = `${input.file_path || ''}\n${String(input.content).slice(0, 150)}`;
              } else if (typeof input === 'object') {
                toolInput = JSON.stringify(input).slice(0, 200);
              }
              return { toolName: block.name, toolInput };
            }
          }
        }
      } catch {
        // skip unparseable lines
      }
    }
  } catch {
    // transcript not readable
  }
  return {};
}

async function handleSessionStart(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  const info: SessionInfo = {
    sessionId: data.session_id,
    pid: process.ppid,
    tty: process.env.TTY || '',
    cwd: data.cwd || process.cwd(),
    windowId: getActiveWindowId(),
    tmuxPane: process.env.TMUX_PANE || undefined,
    timestamp: Date.now(),
  };

  ensureDataDir();
  registerSession(info);
}

async function handleNotification(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  // Only forward permission_prompt and idle_prompt
  const type = data.notification_type;
  if (type !== 'permission_prompt' && type !== 'idle_prompt') {
    return;
  }

  // Enrich permission prompts with tool context from transcript
  let enriched = data;
  if (type === 'permission_prompt' && data.transcript_path) {
    const ctx = extractToolContext(data.transcript_path);
    if (ctx.toolName) {
      enriched = { ...data, tool_name: ctx.toolName, tool_input: ctx.toolInput };
    }
  }

  // Forward to daemon
  try {
    const res = await fetch('http://127.0.0.1:17380/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
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
